from fastapi import FastAPI, APIRouter, Response, Cookie, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt

try:
    from anthropic import AsyncAnthropic
except ImportError:
    AsyncAnthropic = None

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Local-first storage mode for development.
USE_IN_MEMORY_DB = os.environ.get("USE_IN_MEMORY_DB", "1").lower() in ("1", "true", "yes")

client = None
db = None
sessions_collection = None

if not USE_IN_MEMORY_DB:
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://127.0.0.1:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'dental_chatbot')]
    sessions_collection = db.sessions

# In-memory fallback collections for local dev.
users_store = {}
sessions_store = {}
appointments_store = []

COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none" if COOKIE_SECURE else "lax")

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Pydantic Models
class LoginRequest(BaseModel):
    username: str
    password: str

class SignupRequest(BaseModel):
    username: str
    password: str
    confirm_password: str

class ChatRequest(BaseModel):
    message: str

class BookRequest(BaseModel):
    date: str
    time: str
    service: str

class SlotsRequest(BaseModel):
    date: str

class AppointmentResponse(BaseModel):
    date: str
    time: str
    service: str
    status: str
    created_at: str

class UserResponse(BaseModel):
    username: str
    appointments: List[AppointmentResponse]

# Helper functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

async def get_session(session_id: Optional[str]):
    """Get session from MongoDB"""
    if not session_id:
        return None
    if USE_IN_MEMORY_DB:
        session = sessions_store.get(session_id)
    else:
        session = await sessions_collection.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        return None
    # Check if session is expired
    if session.get('expires_at'):
        if datetime.fromisoformat(session['expires_at']) < datetime.now(timezone.utc):
            if USE_IN_MEMORY_DB:
                sessions_store.pop(session_id, None)
            else:
                await sessions_collection.delete_one({"session_id": session_id})
            return None
    return session

async def create_session(session_data: dict) -> str:
    """Create a new session in MongoDB"""
    session_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    
    session_doc = {
        "session_id": session_id,
        "expires_at": expires_at.isoformat(),
        **session_data
    }
    
    if USE_IN_MEMORY_DB:
        sessions_store[session_id] = session_doc
    else:
        await sessions_collection.insert_one(session_doc)
    return session_id

async def update_session(session_id: str, updates: dict):
    """Update session data in MongoDB"""
    if USE_IN_MEMORY_DB:
        if session_id in sessions_store:
            sessions_store[session_id].update(updates)
        return

    await sessions_collection.update_one({"session_id": session_id}, {"$set": updates})

async def delete_session(session_id: str):
    """Delete session from MongoDB"""
    if USE_IN_MEMORY_DB:
        sessions_store.pop(session_id, None)
    else:
        await sessions_collection.delete_one({"session_id": session_id})


async def find_user(username: str):
    if USE_IN_MEMORY_DB:
        return users_store.get(username)
    return await db.users.find_one({"username": username})


async def create_user(username: str, hashed_pw: str):
    if USE_IN_MEMORY_DB:
        users_store[username] = {"username": username, "password": hashed_pw}
        return
    await db.users.insert_one({"username": username, "password": hashed_pw})


async def find_appointment_by_slot(date: str, time: str):
    if USE_IN_MEMORY_DB:
        for appointment in appointments_store:
            if appointment["date"] == date and appointment["time"] == time:
                return appointment
        return None
    return await db.appointments.find_one({"date": date, "time": time})


async def create_appointment(appointment: dict):
    if USE_IN_MEMORY_DB:
        appointments_store.append(appointment)
        return
    await db.appointments.insert_one(appointment)


async def get_user_appointments(username: str):
    if USE_IN_MEMORY_DB:
        return sorted(
            [a for a in appointments_store if a["username"] == username],
            key=lambda x: x["created_at"],
            reverse=True,
        )
    appointments_cursor = db.appointments.find({"username": username}, {"_id": 0}).sort("created_at", -1)
    return await appointments_cursor.to_list(100)


async def get_all_appointments_data():
    if USE_IN_MEMORY_DB:
        return sorted(appointments_store, key=lambda x: x["created_at"], reverse=True)
    appointments_cursor = db.appointments.find({}, {"_id": 0}).sort("created_at", -1)
    return await appointments_cursor.to_list(1000)

async def is_slot_available(date: str, time: str) -> bool:
    """Check if a time slot is available"""
    # Check for overlapping appointments
    existing = await find_appointment_by_slot(date, time)
    return existing is None

async def get_available_slots(date: str) -> List[str]:
    """Get available time slots for a given date"""
    base_slots = [
        "09:00", "10:00", "11:00", "12:00",
        "13:00", "14:00", "15:00", "16:00"
    ]
    
    available = []
    for slot in base_slots:
        if await is_slot_available(date, slot):
            available.append(slot)
    
    return available

VALID_SERVICES = [
    "General Dentistry",
    "Cosmetic Dentistry",
    "Emergency Care",
    "Orthodontics",
    "Cleaning"
]

SYSTEM_PROMPT = (
    "You are a helpful dental assistant chatbot. Provide friendly, accurate information "
    "about dental care, appointments, and services. Keep responses concise and professional."
)


def get_configured_anthropic_key() -> str:
    """Read Claude key from supported env vars and normalize common formatting issues."""
    raw = os.environ.get('ANTHROPIC_API_KEY') or os.environ.get('CLAUDE_API_KEY') or ''
    return raw.strip().strip('"').strip("'")

async def get_ai_response(message: str, session_id: str) -> str:
    """Get AI response using Claude (Anthropic SDK or emergentintegrations)."""
    api_key = get_configured_anthropic_key()
    model_name = os.environ.get('ANTHROPIC_MODEL', 'claude-3-5-haiku-latest')

    if api_key and AsyncAnthropic is not None:
        try:
            client = AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=model_name,
                max_tokens=350,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": message}],
            )

            parts = []
            for block in response.content:
                text = getattr(block, "text", None)
                if text:
                    parts.append(text)

            if parts:
                return "\n".join(parts).strip()
        except Exception as e:
            logging.error(f"Claude SDK error: {e}")

    if api_key and LlmChat is not None and UserMessage is not None:
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=session_id,
                system_message=SYSTEM_PROMPT,
            ).with_model("anthropic", model_name)

            user_message = UserMessage(text=message)
            response = await chat.send_message(user_message)
            if response:
                return response
        except Exception as e:
            logging.error(f"Emergent integration error: {e}")

    return get_fallback_response(message)

def get_fallback_response(message: str) -> str:
    """Rule-based fallback responses"""
    msg_lower = message.lower()

    if msg_lower.strip().startswith(('hello', 'hi', 'hey')):
        return "Hello! I can help with dental symptoms, oral hygiene tips, appointment booking, and clinic timings. What would you like to know?"
    
    if any(word in msg_lower for word in ['pain', 'hurt', 'ache']):
        return "I understand you're experiencing discomfort. For urgent pain, we recommend scheduling an Emergency Care appointment as soon as possible. Would you like to book an appointment?"

    if ('gum' in msg_lower and 'bleed' in msg_lower) or any(word in msg_lower for word in ['bleeding gums', 'gum bleed', 'gum bleeding']):
        return "Bleeding gums can be a sign of gingivitis or brushing too hard. Please brush gently with a soft-bristle brush, floss daily, and schedule a dental exam soon for proper diagnosis."

    if any(word in msg_lower for word in ['cavity', 'tooth decay', 'hole in tooth']):
        return "Possible cavity symptoms include sensitivity, pain while eating sweets, or visible dark spots. Early treatment prevents deeper damage, so we recommend booking a checkup."

    if any(word in msg_lower for word in ['sensitive teeth', 'sensitivity', 'cold pain', 'hot pain']):
        return "Tooth sensitivity can come from enamel wear, gum recession, or cavities. Use a sensitivity toothpaste, avoid very acidic foods, and book an exam if symptoms persist."

    if any(word in msg_lower for word in ['bad breath', 'mouth odor', 'halitosis']):
        return "Persistent bad breath can be caused by plaque buildup, gum disease, dry mouth, or food debris. Brush your tongue, floss daily, stay hydrated, and consider a dental cleaning."

    if any(word in msg_lower for word in ['braces', 'aligners', 'orthodontic']):
        return "We offer orthodontic care to help align teeth and improve bite. During a consultation, we can assess whether braces or aligners are best for you."

    if any(word in msg_lower for word in ['wisdom tooth', 'wisdom teeth']):
        return "Wisdom teeth may cause pain, swelling, or crowding. A clinical exam and X-ray help determine if monitoring or extraction is needed."

    if any(word in msg_lower for word in ['brush', 'toothbrush', 'floss']):
        return "For good oral hygiene: brush twice daily for 2 minutes with fluoride toothpaste, floss once daily, and visit for professional cleaning every 6 months."
    
    if 'cleaning' in msg_lower:
        return "Regular cleanings are important for oral health! We recommend cleanings every 6 months. Our Cleaning service includes thorough examination and professional cleaning. Would you like to schedule one?"
    
    if any(word in msg_lower for word in ['hour', 'open', 'time']):
        return "We're open Monday-Friday, 9:00 AM to 5:00 PM. You can book appointments between 9:00 AM and 4:00 PM. How can I help you today?"
    
    if any(word in msg_lower for word in ['book', 'appointment', 'schedule']):
        return "I'd be happy to help you book an appointment! Please use the booking form on the right to select your preferred date, time, and service."
    
    return "Thank you for your message! I'm here to help with dental questions and appointments. You can book an appointment using the form on the right, or ask me anything about our services."

# Auth endpoints
@api_router.post("/signup")
async def signup(data: SignupRequest, response: Response):
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    # Check if user exists
    existing = await find_user(data.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create user
    hashed_pw = hash_password(data.password)
    await create_user(data.username, hashed_pw)
    
    # Create session in MongoDB
    session_id = await create_session({
        "logged_in": True,
        "username": data.username,
        "booking_state": None,
        "booking_date": None,
        "booking_time": None
    })
    
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        max_age=86400,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        path="/"
    )
    
    return {"message": "Signup successful", "username": data.username}

@api_router.post("/login")
async def login(data: LoginRequest, response: Response):
    user = await find_user(data.username)
    if not user or not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Create session in MongoDB
    session_id = await create_session({
        "logged_in": True,
        "username": data.username,
        "booking_state": None,
        "booking_date": None,
        "booking_time": None
    })
    
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        max_age=86400,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        path="/"
    )
    
    return {"message": "Login successful", "username": data.username}

@api_router.post("/logout")
async def logout(response: Response, session_id: Optional[str] = Cookie(None)):
    if session_id:
        await delete_session(session_id)
    
    response.delete_cookie("session_id")
    return {"message": "Logged out successfully"}

# Admin endpoints
@api_router.post("/admin/login")
async def admin_login(data: LoginRequest, response: Response):
    admin_username = os.environ.get('ADMIN_USERNAME', 'admin')
    admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
    
    if data.username != admin_username or data.password != admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    
    # Create admin session in MongoDB
    session_id = await create_session({
        "logged_in": True,
        "username": data.username,
        "is_admin": True
    })
    
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        max_age=86400,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        path="/"
    )
    
    return {"message": "Admin login successful", "username": data.username}

@api_router.get("/admin/appointments")
async def get_all_appointments(session_id: Optional[str] = Cookie(None)):
    session = await get_session(session_id)
    if not session or not session.get('is_admin'):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    appointments = await get_all_appointments_data()
    
    return {"appointments": appointments}

@api_router.get("/me")
async def get_me(session_id: Optional[str] = Cookie(None)):
    session = await get_session(session_id)
    if not session or not session.get('logged_in'):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    username = session['username']
    
    appointments = await get_user_appointments(username)
    
    return {
        "username": username,
        "appointments": appointments
    }

# Booking endpoints
@api_router.post("/slots")
async def get_slots(data: SlotsRequest, session_id: Optional[str] = Cookie(None)):
    session = await get_session(session_id)
    if not session or not session.get('logged_in'):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    slots = await get_available_slots(data.date)
    return {"slots": slots}

@api_router.post("/book")
async def book_appointment(data: BookRequest, session_id: Optional[str] = Cookie(None)):
    session = await get_session(session_id)
    if not session or not session.get('logged_in'):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate service
    if data.service not in VALID_SERVICES:
        raise HTTPException(status_code=400, detail="Invalid service")
    
    # Check slot availability
    if not await is_slot_available(data.date, data.time):
        raise HTTPException(status_code=400, detail="Time slot not available")
    
    # Validate date is in future
    try:
        appointment_date = datetime.fromisoformat(data.date)
        if appointment_date.date() < datetime.now(timezone.utc).date():
            raise HTTPException(status_code=400, detail="Cannot book appointments in the past")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    # Create appointment
    appointment = {
        "username": session['username'],
        "date": data.date,
        "time": data.time,
        "service": data.service,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await create_appointment(appointment)
    
    # Return appointment without MongoDB _id to avoid serialization issues
    appointment_response = {
        "username": appointment["username"],
        "date": appointment["date"], 
        "time": appointment["time"],
        "service": appointment["service"],
        "status": appointment["status"],
        "created_at": appointment["created_at"]
    }
    
    return {"message": "Appointment booked successfully", "appointment": appointment_response}

# Chat endpoint
@api_router.post("/chat")
async def chat(data: ChatRequest, session_id: Optional[str] = Cookie(None)):
    session = await get_session(session_id)
    if not session or not session.get('logged_in'):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    message = data.message
    msg_lower = message.lower()
    
    # Check if user wants to book via chat
    booking_state = session.get('booking_state')
    
    if booking_state is None and any(word in msg_lower for word in ['book', 'appointment', 'schedule']):
        await update_session(session_id, {"booking_state": 'confirm_booking'})
        return {"response": "I'd be happy to help you book an appointment! However, it's easier to use the booking form on the right side of the screen. Would you still like me to help you book through chat? (yes/no)"}
    
    if booking_state == 'confirm_booking':
        if 'yes' in msg_lower:
            await update_session(session_id, {"booking_state": 'ask_date'})
            return {"response": "Great! What date would you like to book? Please provide the date in YYYY-MM-DD format (e.g., 2026-01-20)."}
        else:
            await update_session(session_id, {"booking_state": None})
            return {"response": "No problem! Feel free to use the booking form on the right, or ask me any questions about our services."}
    
    if booking_state == 'ask_date':
        try:
            date = datetime.fromisoformat(message.strip())
            if date.date() < datetime.now(timezone.utc).date():
                return {"response": "Please provide a future date in YYYY-MM-DD format."}
            await update_session(session_id, {"booking_date": message.strip(), "booking_state": 'ask_time'})
            slots = await get_available_slots(message.strip())
            if not slots:
                await update_session(session_id, {"booking_state": None, "booking_date": None})
                return {"response": "Sorry, no slots available for that date. Please try another date or use the booking form."}
            return {"response": f"Available times for {message.strip()}: {', '.join(slots)}. Which time works for you?"}
        except ValueError:
            return {"response": "Invalid date format. Please use YYYY-MM-DD (e.g., 2026-01-20)."}
    
    if booking_state == 'ask_time':
        time = message.strip()
        # Re-fetch session to get booking_date
        session = await get_session(session_id)
        if not await is_slot_available(session['booking_date'], time):
            return {"response": "That time slot is not available. Please choose from the available times I mentioned."}
        await update_session(session_id, {"booking_time": time, "booking_state": 'ask_service'})
        return {"response": f"Perfect! What service do you need? Options: {', '.join(VALID_SERVICES)}"}
    
    if booking_state == 'ask_service':
        service = None
        for valid_service in VALID_SERVICES:
            if valid_service.lower() in msg_lower:
                service = valid_service
                break
        
        if not service:
            return {"response": f"Please choose from: {', '.join(VALID_SERVICES)}"}
        
        # Re-fetch session to get booking details
        session = await get_session(session_id)
        
        # Book the appointment
        appointment = {
            "username": session['username'],
            "date": session['booking_date'],
            "time": session['booking_time'],
            "service": service,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await create_appointment(appointment)
        
        # Store booking details for response before clearing state
        booking_date = session['booking_date']
        booking_time = session['booking_time']
        
        # Clear booking state
        await update_session(session_id, {
            "booking_state": None,
            "booking_date": None,
            "booking_time": None
        })
        
        return {"response": f"Excellent! Your {service} appointment is booked for {booking_date} at {booking_time}. You can view it in your appointments list."}
    
    # Regular chat with AI
    ai_response = await get_ai_response(message, session_id)
    return {"response": ai_response}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()