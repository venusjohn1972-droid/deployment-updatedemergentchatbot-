#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta
import time

class DentalClinicAPITester:
    def __init__(self):
        self.base_url = "https://clinic-chat-6.preview.emergentagent.com/api"
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.username = f"test_user_{int(time.time())}"
        self.password = "TestPass123!"
        self.tests_run = 0
        self.tests_passed = 0
        self.session_cookie = None

    def run_test(self, name, method, endpoint, expected_status, data=None, require_auth=True):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"URL: {url}")
        if data:
            print(f"Data: {json.dumps(data, indent=2)}")
        
        try:
            if method == 'GET':
                response = self.session.get(url)
            elif method == 'POST':
                response = self.session.post(url, json=data)
            elif method == 'DELETE':
                response = self.session.delete(url)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.headers.get('content-type', '').startswith('application/json'):
                    try:
                        response_data = response.json()
                        print(f"Response: {json.dumps(response_data, indent=2)}")
                    except:
                        print(f"Response: {response.text}")
                return True, response
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text}")
                return False, response

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, None

    def test_signup(self):
        """Test user signup"""
        success, response = self.run_test(
            "User Signup",
            "POST",
            "signup",
            200,
            data={
                "username": self.username,
                "password": self.password,
                "confirm_password": self.password
            }
        )
        return success

    def test_signup_validation(self):
        """Test signup validation"""
        # Test password mismatch
        success, response = self.run_test(
            "Signup Password Mismatch",
            "POST",
            "signup",
            400,
            data={
                "username": f"test_validation_{int(time.time())}",
                "password": "password123",
                "confirm_password": "different_password"
            }
        )
        return success

    def test_login(self):
        """Test user login"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "login",
            200,
            data={
                "username": self.username,
                "password": self.password
            }
        )
        if success and response:
            # Store session cookie for authenticated requests
            cookies = response.cookies
            if cookies:
                for cookie in cookies:
                    if cookie.name == 'session_id':
                        self.session_cookie = cookie.value
                        print(f"Session cookie stored: {self.session_cookie[:20]}...")
        return success

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        success, response = self.run_test(
            "Login Invalid Credentials",
            "POST",
            "login",
            401,
            data={
                "username": "nonexistent_user",
                "password": "wrong_password"
            }
        )
        return success

    def test_get_me(self):
        """Test get current user info"""
        success, response = self.run_test(
            "Get User Info",
            "GET",
            "me",
            200
        )
        return success

    def test_get_me_unauthenticated(self):
        """Test get user info without authentication"""
        # Temporarily clear session
        temp_session = requests.Session()
        temp_session.headers.update({'Content-Type': 'application/json'})
        
        url = f"{self.base_url}/me"
        print(f"\n🔍 Testing Get User Info (Unauthenticated)...")
        
        try:
            response = temp_session.get(url)
            success = response.status_code == 401
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
            else:
                print(f"❌ Failed - Expected 401, got {response.status_code}")
            self.tests_run += 1
            return success
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.tests_run += 1
            return False

    def test_slots_endpoint(self):
        """Test getting available slots"""
        future_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        success, response = self.run_test(
            "Get Available Slots",
            "POST",
            "slots",
            200,
            data={"date": future_date}
        )
        return success

    def test_book_appointment(self):
        """Test booking an appointment"""
        future_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # First get available slots
        slots_success, slots_response = self.run_test(
            "Get Slots for Booking",
            "POST", 
            "slots",
            200,
            data={"date": future_date}
        )
        
        if not slots_success:
            return False
            
        try:
            slots_data = slots_response.json()
            available_slots = slots_data.get('slots', [])
            
            if not available_slots:
                print("❌ No available slots to test booking")
                return False
                
            # Book the first available slot
            time_slot = available_slots[0]
            success, response = self.run_test(
                "Book Appointment",
                "POST",
                "book",
                200,
                data={
                    "date": future_date,
                    "time": time_slot,
                    "service": "General Dentistry"
                }
            )
            return success
        except Exception as e:
            print(f"❌ Error processing slots: {str(e)}")
            return False

    def test_book_appointment_validation(self):
        """Test appointment booking validation"""
        # Test invalid service
        future_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        success, response = self.run_test(
            "Book Appointment Invalid Service",
            "POST",
            "book", 
            400,
            data={
                "date": future_date,
                "time": "10:00",
                "service": "Invalid Service"
            }
        )
        return success

    def test_book_past_date(self):
        """Test booking appointment in the past"""
        past_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        success, response = self.run_test(
            "Book Appointment Past Date",
            "POST",
            "book",
            400,
            data={
                "date": past_date,
                "time": "10:00",
                "service": "General Dentistry"
            }
        )
        return success

    def test_chat_endpoint(self):
        """Test chat functionality"""
        success, response = self.run_test(
            "Chat Basic Message",
            "POST",
            "chat",
            200,
            data={"message": "Hello, I need help with dental care"}
        )
        return success

    def test_chat_booking_flow(self):
        """Test chat-based booking flow"""
        messages = [
            "I want to book an appointment",
            "yes", 
            (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d'),
            "10:00",
            "cleaning"
        ]
        
        all_success = True
        for i, message in enumerate(messages):
            success, response = self.run_test(
                f"Chat Booking Flow Step {i+1}",
                "POST",
                "chat",
                200,
                data={"message": message}
            )
            if not success:
                all_success = False
            time.sleep(0.5)  # Small delay between messages
            
        return all_success

    def test_logout(self):
        """Test user logout"""
        success, response = self.run_test(
            "User Logout",
            "POST",
            "logout",
            200
        )
        return success

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Dental Clinic API Tests")
        print("=" * 50)
        
        # Authentication tests
        print("\n📝 Testing Authentication...")
        self.test_signup()
        self.test_signup_validation()
        self.test_login()
        self.test_login_invalid_credentials()
        self.test_get_me()
        self.test_get_me_unauthenticated()
        
        # Booking tests
        print("\n📅 Testing Booking System...")
        self.test_slots_endpoint()
        self.test_book_appointment()
        self.test_book_appointment_validation()
        self.test_book_past_date()
        
        # Chat tests
        print("\n💬 Testing Chat System...")
        self.test_chat_endpoint()
        self.test_chat_booking_flow()
        
        # Logout
        print("\n🚪 Testing Logout...")
        self.test_logout()
        
        # Results
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("✅ All tests passed!")
            return 0
        else:
            print(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    tester = DentalClinicAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())