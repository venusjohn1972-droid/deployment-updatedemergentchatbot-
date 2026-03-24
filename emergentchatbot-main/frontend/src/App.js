import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Calendar, Clock, User, MessageCircle, LogOut, Sparkles, Heart, Shield, Smile, Users, Eye, EyeOff } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import '@/App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

function App() {
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  
  const [user, setUser] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [messages, setMessages] = useState([{
    role: 'bot',
    text: 'Hello! I\'m your dental assistant. How can I help you today? Feel free to ask about our services or book an appointment!'
  }]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingService, setBookingService] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  useEffect(() => {
    checkAuth();
  }, []);
  
  // Carousel auto-slide
  useEffect(() => {
    if (showLandingPage) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % 3);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [showLandingPage]);
  
  const checkAuth = async () => {
    try {
      const response = await axios.get(`${API}/me`);
      setUser(response.data.username);
      setAppointments(response.data.appointments || []);
      setIsLoggedIn(true);
      setShowLandingPage(false);
    } catch (error) {
      setIsLoggedIn(false);
    }
  };
  
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    
    try {
      const endpoint = isSignup ? '/signup' : '/login';
      const data = isSignup 
        ? { username, password, confirm_password: confirmPassword }
        : { username, password };
      
      const response = await axios.post(`${API}${endpoint}`, data);
      setIsLoggedIn(true);
      setShowLandingPage(false);
      setUser(response.data.username);
      await checkAuth();
      toast.success(`Welcome ${response.data.username}!`);
    } catch (error) {
      setAuthError(error.response?.data?.detail || 'Authentication failed');
      toast.error(error.response?.data?.detail || 'Authentication failed');
    }
  };
  
  const handleLogout = async () => {
    try {
      await axios.post(`${API}/logout`);
      setIsLoggedIn(false);
      setIsAdmin(false);
      setIsAdminLogin(false);
      setUser(null);
      setAppointments([]);
      setAllAppointments([]);
      setMessages([{
        role: 'bot',
        text: 'Hello! I\'m your dental assistant. How can I help you today?'
      }]);
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Logout failed');
    }
  };
  
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    
    try {
      const response = await axios.post(`${API}/admin/login`, { username, password });
      setIsLoggedIn(true);
      setShowLandingPage(false);
      setIsAdmin(true);
      setUser(response.data.username);
      await fetchAllAppointments();
      toast.success('Admin login successful!');
    } catch (error) {
      setAuthError(error.response?.data?.detail || 'Admin login failed');
      toast.error(error.response?.data?.detail || 'Admin login failed');
    }
  };
  
  const fetchAllAppointments = async () => {
    try {
      const response = await axios.get(`${API}/admin/appointments`);
      setAllAppointments(response.data.appointments || []);
    } catch (error) {
      toast.error('Failed to fetch appointments');
    }
  };
  
  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');
    setIsTyping(true);
    
    try {
      const response = await axios.post(`${API}/chat`, { message: userMessage });
      setMessages(prev => [...prev, { role: 'bot', text: response.data.response }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, I encountered an error. Please try again.' }]);
      toast.error('Failed to send message');
    } finally {
      setIsTyping(false);
    }
  };
  
  const handleDateChange = async (date) => {
    setBookingDate(date);
    setBookingTime('');
    
    if (!date) {
      setAvailableSlots([]);
      return;
    }
    
    try {
      const response = await axios.post(`${API}/slots`, { date });
      setAvailableSlots(response.data.slots || []);
    } catch (error) {
      toast.error('Failed to fetch available slots');
      setAvailableSlots([]);
    }
  };
  
  const handleBooking = async (e) => {
    e.preventDefault();
    
    if (!bookingDate || !bookingTime || !bookingService) {
      toast.error('Please fill in all fields');
      return;
    }
    
    try {
      await axios.post(`${API}/book`, {
        date: bookingDate,
        time: bookingTime,
        service: bookingService
      });
      
      toast.success('Appointment booked successfully!');
      setBookingDate('');
      setBookingTime('');
      setBookingService('');
      setAvailableSlots([]);
      
      // Refresh appointments
      await checkAuth();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to book appointment');
    }
  };
  
  const services = [
    { name: 'General Dentistry', icon: Shield, description: 'Comprehensive dental care' },
    { name: 'Cosmetic Dentistry', icon: Sparkles, description: 'Enhance your smile' },
    { name: 'Emergency Care', icon: Heart, description: '24/7 urgent care' },
    { name: 'Orthodontics', icon: Smile, description: 'Teeth alignment' }
  ];
  
  const carouselImages = [
    "https://images.unsplash.com/photo-1629909613638-0e4a1fad8f81?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBkZW50YWwlMjBjbGluaWMlMjBpbnRlcmlvciUyMHByb2Zlc3Npb25hbHxlbnwwfHx8fDE3NzQyNDAyNjJ8MA&ixlib=rb-4.1.0&q=85",
    "https://images.pexels.com/photos/3845808/pexels-photo-3845808.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "https://images.pexels.com/photos/4269264/pexels-photo-4269264.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
  ];
  
  const today = new Date().toISOString().split('T')[0];
  
  // Landing Page
  if (showLandingPage && !isLoggedIn) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FAFAF9', fontFamily: 'DM Sans, sans-serif' }}>
        <Toaster position="top-center" richColors />
        
        {/* Navigation */}
        <nav className="fixed w-full z-50 bg-white/95 backdrop-blur-md shadow-sm" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3A8D91' }}>
                <Smile className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                Venus Johns Dental Clinic
              </h1>
            </div>
            <button
              data-testid="nav-login-btn"
              onClick={() => setShowLandingPage(false)}
              className="px-8 py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all duration-200 active:scale-95"
              style={{ backgroundColor: '#3A8D91', color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif' }}
            >
              Login / Sign Up
            </button>
          </div>
        </nav>
        
        {/* Hero Section with Carousel */}
        <div className="pt-20 min-h-screen flex items-center" style={{ background: 'linear-gradient(135deg, #FAFAF9 0%, #E6F4F1 50%, #FAFAF9 100%)' }}>
          <div className="max-w-7xl mx-auto px-6 py-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left: Content */}
              <div data-testid="hero-content" className="space-y-6 animate-fade-in">
                <div className="inline-block px-4 py-2 rounded-full text-sm font-medium" style={{ backgroundColor: '#E6F4F1', color: '#3A8D91' }}>
                  ✨ Your Smile, Our Priority
                </div>
                <h1 className="text-6xl font-bold leading-tight" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                  Experience<br/>
                  <span style={{ color: '#3A8D91' }}>World-Class</span><br/>
                  Dental Care in Mumbai
                </h1>
                <a 
                  href="tel:+919766819278" 
                  className="flex items-center gap-3 text-2xl font-semibold hover:opacity-80 transition-opacity"
                  style={{ color: '#3A8D91' }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E6F4F1' }}>
                    <MessageCircle className="w-6 h-6" style={{ color: '#3A8D91' }} />
                  </div>
                  +91 9766819278
                </a>
                <p className="text-xl leading-relaxed" style={{ color: '#64748B' }}>
                  Advanced technology, compassionate care, and beautiful smiles. Book your appointment today with our AI-powered chatbot assistant.
                </p>
                <div className="flex gap-4 pt-4">
                  <button
                    data-testid="hero-book-btn"
                    onClick={() => setShowLandingPage(false)}
                    className="px-10 py-4 rounded-full font-bold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
                    style={{ backgroundColor: '#3A8D91', color: '#FFFFFF' }}
                  >
                    Book Appointment
                  </button>
                  <button
                    className="px-10 py-4 rounded-full font-bold text-lg border-2 transition-all duration-300 hover:-translate-y-1"
                    style={{ borderColor: '#3A8D91', color: '#3A8D91', backgroundColor: 'transparent' }}
                  >
                    Learn More
                  </button>
                </div>
                
                {/* Stats */}
                <div className="grid grid-cols-3 gap-8 pt-8">
                  <div>
                    <div className="text-4xl font-bold" style={{ color: '#3A8D91', fontFamily: 'Outfit, sans-serif' }}>10K+</div>
                    <div className="text-sm" style={{ color: '#64748B' }}>Happy Patients</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold" style={{ color: '#3A8D91', fontFamily: 'Outfit, sans-serif' }}>15+</div>
                    <div className="text-sm" style={{ color: '#64748B' }}>Years Experience</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold" style={{ color: '#3A8D91', fontFamily: 'Outfit, sans-serif' }}>24/7</div>
                    <div className="text-sm" style={{ color: '#64748B' }}>AI Assistant</div>
                  </div>
                </div>
              </div>
              
              {/* Right: Carousel */}
              <div className="relative h-[600px] rounded-3xl overflow-hidden shadow-2xl">
                {carouselImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="absolute inset-0 transition-opacity duration-1000"
                    style={{ opacity: currentSlide === idx ? 1 : 0 }}
                  >
                    <img
                      src={img}
                      alt={`Dental clinic ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                  </div>
                ))}
                
                {/* Carousel Indicators */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                  {carouselImages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className="w-3 h-3 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: currentSlide === idx ? '#3A8D91' : '#FFFFFF',
                        opacity: currentSlide === idx ? 1 : 0.5
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Services Section */}
        <div className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                Our Services
              </h2>
              <p className="text-xl" style={{ color: '#64748B' }}>
                Comprehensive dental care tailored to your needs
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {services.map((service, idx) => (
                <div
                  key={idx}
                  data-testid={`landing-service-${idx}`}
                  className="p-8 rounded-3xl border-2 hover:-translate-y-2 transition-all duration-300 cursor-pointer group"
                  style={{ borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }}
                >
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300" style={{ backgroundColor: '#E6F4F1' }}>
                    <service.icon className="w-8 h-8" style={{ color: '#3A8D91' }} />
                  </div>
                  <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                    {service.name}
                  </h3>
                  <p style={{ color: '#64748B' }}>{service.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Features Section */}
        <div className="py-24" style={{ background: 'linear-gradient(135deg, #E6F4F1 0%, #FAFAF9 100%)' }}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <img
                  src="https://images.pexels.com/photos/3845744/pexels-photo-3845744.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
                  alt="Happy patient"
                  className="rounded-3xl shadow-2xl"
                />
              </div>
              <div className="space-y-8">
                <h2 className="text-5xl font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                  Why Choose Us?
                </h2>
                
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#3A8D91' }}>
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2" style={{ color: '#334155' }}>AI-Powered Booking</h3>
                      <p style={{ color: '#64748B' }}>Chat with our intelligent assistant 24/7 to book appointments instantly</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#3A8D91' }}>
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2" style={{ color: '#334155' }}>Expert Care</h3>
                      <p style={{ color: '#64748B' }}>Board-certified dentists with 15+ years of experience</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#3A8D91' }}>
                      <Heart className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2" style={{ color: '#334155' }}>Patient-Centered</h3>
                      <p style={{ color: '#64748B' }}>Comfortable environment with personalized treatment plans</p>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowLandingPage(false)}
                  className="px-10 py-4 rounded-full font-bold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 mt-8"
                  style={{ backgroundColor: '#3A8D91', color: '#FFFFFF' }}
                >
                  Get Started Today
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* CTA Section */}
        <div className="py-24 bg-white">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-5xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
              Ready for a Brighter Smile?
            </h2>
            <p className="text-xl mb-10" style={{ color: '#64748B' }}>
              Book your appointment now and experience the difference
            </p>
            <button
              data-testid="cta-book-btn"
              onClick={() => setShowLandingPage(false)}
              className="px-16 py-5 rounded-full font-bold text-xl shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-2"
              style={{ backgroundColor: '#3A8D91', color: '#FFFFFF' }}
            >
              Book Appointment Now →
            </button>
          </div>
        </div>
        
        {/* Footer */}
        <footer className="py-16 border-t" style={{ backgroundColor: '#334155', borderColor: '#E2E8F0' }}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {/* Column 1: Branding */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3A8D91' }}>
                    <Smile className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: '#FFFFFF' }}>
                    Venus Johns Dental Clinic
                  </span>
                </div>
                <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>
                  Your trusted partner in oral health. Experience world-class dental care with our expert team.
                </p>
                <p className="text-xs" style={{ color: '#64748B' }}>
                  © 2026 Venus Johns Dental Clinic. All rights reserved.
                </p>
              </div>
              
              {/* Column 2: Contact & Address */}
              <div>
                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif', color: '#FFFFFF' }}>
                  Contact Us
                </h3>
                <div className="space-y-3 text-sm" style={{ color: '#94A3B8' }}>
                  <div className="flex items-start gap-2">
                    <User className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#3A8D91' }} />
                    <div>
                      <p className="font-medium" style={{ color: '#FFFFFF' }}>Address</p>
                      <p>EC69 B4 Evershine City</p>
                      <p>Vasai East, Thane</p>
                      <p>Maharashtra, MH 401208</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#3A8D91' }} />
                    <a href="tel:+919766819278" className="hover:text-white transition-colors">
                      +91 9766819278
                    </a>
                  </div>
                </div>
              </div>
              
              {/* Column 3: Hours */}
              <div>
                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif', color: '#FFFFFF' }}>
                  Business Hours
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#3A8D91' }} />
                    <div className="text-sm" style={{ color: '#94A3B8' }}>
                      <p className="font-medium mb-2" style={{ color: '#FFFFFF' }}>Open Today</p>
                      <p className="text-lg font-semibold" style={{ color: '#3A8D91' }}>09:00 AM – 05:00 PM</p>
                      <p className="mt-3">Monday - Friday</p>
                      <p className="text-xs" style={{ color: '#64748B' }}>Closed on weekends and public holidays</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Bottom Bar */}
            <div className="mt-12 pt-8 border-t text-center" style={{ borderColor: '#475569' }}>
              <p className="text-sm" style={{ color: '#64748B' }}>
                Powered by AI Technology • Book appointments 24/7 with our intelligent assistant
              </p>
            </div>
          </div>
        </footer>
      </div>
    );
  }
  
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFAF9 0%, #E6F4F1 50%, #FAFAF9 100%)' }}>
        <Toaster position="top-center" richColors />
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#3A8D91' }}>
                  {isAdminLogin ? <Users className="w-8 h-8 text-white" /> : <Smile className="w-8 h-8 text-white" />}
                </div>
                <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                  Venus Johns Dental Clinic
                </h1>
                <p className="text-gray-600" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {isAdminLogin ? 'Admin Portal' : 'Your trusted partner in oral health'}
                </p>
              </div>
              
              <div className="flex gap-2 mb-6">
                {!isAdminLogin && (
                  <>
                    <button
                      data-testid="toggle-login-btn"
                      onClick={() => { setIsSignup(false); setAuthError(''); }}
                      className="flex-1 py-2 rounded-full font-medium transition-all duration-200"
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        backgroundColor: !isSignup ? '#3A8D91' : '#F0EFE9',
                        color: !isSignup ? '#FFFFFF' : '#334155'
                      }}
                    >
                      Login
                    </button>
                    <button
                      data-testid="toggle-signup-btn"
                      onClick={() => { setIsSignup(true); setAuthError(''); }}
                      className="flex-1 py-2 rounded-full font-medium transition-all duration-200"
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        backgroundColor: isSignup ? '#3A8D91' : '#F0EFE9',
                        color: isSignup ? '#FFFFFF' : '#334155'
                      }}
                    >
                      Sign Up
                    </button>
                  </>
                )}
              </div>
              
              <form onSubmit={isAdminLogin ? handleAdminLogin : handleAuth} className="space-y-4">
                <div>
                  <input
                    data-testid="auth-username-input"
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 transition-all"
                    style={{ fontFamily: 'DM Sans, sans-serif', focusRingColor: '#3A8D91' }}
                    required
                  />
                </div>
                
                <div>
                  <div className="relative">
                    <input
                      data-testid="auth-password-input"
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-12 px-4 pr-12 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 transition-all"
                      style={{ fontFamily: 'DM Sans, sans-serif' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                      data-testid="toggle-password-visibility"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                
                {isSignup && (
                  <div>
                    <div className="relative">
                      <input
                        data-testid="auth-confirm-password-input"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full h-12 px-4 pr-12 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 transition-all"
                        style={{ fontFamily: 'DM Sans, sans-serif' }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                        data-testid="toggle-confirm-password-visibility"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                )}
                
                {authError && (
                  <div data-testid="auth-error-message" className="text-sm p-3 rounded-lg" style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontFamily: 'DM Sans, sans-serif' }}>
                    {authError}
                  </div>
                )}
                
                <button
                  data-testid="auth-submit-btn"
                  type="submit"
                  className="w-full py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all duration-200 active:scale-95"
                  style={{
                    backgroundColor: '#3A8D91',
                    color: '#FFFFFF',
                    fontFamily: 'DM Sans, sans-serif'
                  }}
                >
                  {isAdminLogin ? 'Admin Sign In' : (isSignup ? 'Create Account' : 'Sign In')}
                </button>
              </form>
              
              <div className="mt-4 text-center">
                <button
                  onClick={() => { setIsAdminLogin(!isAdminLogin); setAuthError(''); setIsSignup(false); }}
                  className="text-sm hover:underline"
                  style={{ color: '#3A8D91', fontFamily: 'DM Sans, sans-serif' }}
                >
                  {isAdminLogin ? '← Back to Patient Login' : 'Admin Login →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Admin Dashboard
  if (isAdmin) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FAFAF9', fontFamily: 'DM Sans, sans-serif' }}>
        <Toaster position="top-center" richColors />
        
        {/* Header */}
        <div className="border-b" style={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3A8D91' }}>
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                  Admin Dashboard
                </h1>
                <p className="text-sm text-gray-600">Venus Johns Dental Clinic</p>
              </div>
            </div>
            
            <button
              data-testid="logout-btn"
              onClick={handleLogout}
              className="flex items-center gap-2 px-6 py-2 rounded-full font-medium transition-all duration-200 hover:shadow-md"
              style={{ backgroundColor: '#F0EFE9', color: '#334155' }}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-white rounded-3xl border shadow-sm p-6" style={{ borderColor: '#E2E8F0' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                All Patient Appointments
              </h2>
              <div className="text-sm" style={{ color: '#64748B' }}>
                Total: {allAppointments.length} appointments
              </div>
            </div>
            
            {allAppointments.length === 0 ? (
              <p data-testid="no-appointments-message" className="text-center py-8" style={{ color: '#64748B' }}>
                No appointments found
              </p>
            ) : (
              <div className="overflow-x-auto" data-testid="admin-appointments-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: '#E2E8F0' }}>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Patient</th>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Date</th>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Time</th>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Service</th>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Status</th>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Booked On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allAppointments.map((apt, idx) => (
                      <tr key={idx} data-testid={`admin-appointment-row-${idx}`} className="border-b hover:bg-gray-50" style={{ borderColor: '#E2E8F0' }}>
                        <td className="py-3 px-4 font-medium">{apt.username}</td>
                        <td className="py-3 px-4">{apt.date}</td>
                        <td className="py-3 px-4">{apt.time}</td>
                        <td className="py-3 px-4">{apt.service}</td>
                        <td className="py-3 px-4">
                          <span
                            data-testid={`admin-appointment-status-${idx}`}
                            className="px-3 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: apt.status === 'pending' ? '#FEF3C7' : '#D1FAE5',
                              color: apt.status === 'pending' ? '#92400E' : '#065F46'
                            }}
                          >
                            {apt.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#64748B' }}>
                          {new Date(apt.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF9', fontFamily: 'DM Sans, sans-serif' }}>
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <div className="border-b" style={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3A8D91' }}>
              <Smile className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                Venus Johns Dental Clinic
              </h1>
              <p className="text-sm text-gray-600">Welcome, {user}!</p>
            </div>
          </div>
          
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-2 px-6 py-2 rounded-full font-medium transition-all duration-200 hover:shadow-md"
            style={{ backgroundColor: '#F0EFE9', color: '#334155' }}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto p-6">
        {/* Services Grid */}
        <div className="mb-6">
          <h2 className="text-3xl font-semibold mb-6" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
            Our Services
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service) => (
              <div
                key={service.name}
                data-testid={`service-card-${service.name.toLowerCase().replace(/\s+/g, '-')}`}
                className="bg-white rounded-3xl border p-6 hover:-translate-y-1 transition-all duration-300 hover:shadow-lg cursor-pointer"
                style={{ borderColor: '#E2E8F0' }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#E6F4F1' }}>
                  <service.icon className="w-6 h-6" style={{ color: '#3A8D91' }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                  {service.name}
                </h3>
                <p className="text-sm" style={{ color: '#64748B' }}>{service.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chatbot Panel (Left) */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl border shadow-sm h-[600px] flex flex-col" style={{ borderColor: '#E2E8F0' }}>
              <div className="p-6 border-b" style={{ borderColor: '#E2E8F0' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E6F4F1' }}>
                    <MessageCircle className="w-5 h-5" style={{ color: '#3A8D91' }} />
                  </div>
                  <h3 className="text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                    Dental Assistant
                  </h3>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4" data-testid="chat-messages-container">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    data-testid={`chat-message-${msg.role}-${idx}`}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="rounded-2xl px-4 py-3 max-w-[85%] text-sm shadow-sm"
                      style={{
                        backgroundColor: msg.role === 'user' ? '#3A8D91' : '#F0EFE9',
                        color: msg.role === 'user' ? '#FFFFFF' : '#334155',
                        borderRadius: msg.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem'
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start" data-testid="typing-indicator">
                    <div className="rounded-2xl px-4 py-3 text-sm shadow-sm" style={{ backgroundColor: '#F0EFE9', color: '#334155' }}>
                      Typing...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              <div className="p-6 border-t" style={{ borderColor: '#E2E8F0' }}>
                <div className="flex gap-2">
                  <input
                    data-testid="chat-input"
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 h-12 px-4 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                  <button
                    data-testid="chat-send-btn"
                    onClick={sendMessage}
                    className="px-6 py-3 rounded-full font-medium shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
                    style={{ backgroundColor: '#3A8D91', color: '#FFFFFF' }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Booking & Appointments Panel (Right) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Booking Form */}
            <div className="bg-white rounded-3xl border shadow-sm p-6" style={{ borderColor: '#E2E8F0' }}>
              <h3 className="text-2xl font-semibold mb-6" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                Book Appointment
              </h3>
              
              <form onSubmit={handleBooking} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#334155' }}>
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Date
                  </label>
                  <input
                    data-testid="booking-date-input"
                    type="date"
                    value={bookingDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    min={today}
                    className="w-full h-12 px-4 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#E2E8F0' }}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#334155' }}>
                    <Clock className="w-4 h-4 inline mr-2" />
                    Time
                  </label>
                  <select
                    data-testid="booking-time-select"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#E2E8F0' }}
                    disabled={!bookingDate || availableSlots.length === 0}
                    required
                  >
                    <option value="">Select a time</option>
                    {availableSlots.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                  {bookingDate && availableSlots.length === 0 && (
                    <p className="text-sm mt-2" style={{ color: '#FF8F7E' }}>No slots available for this date</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#334155' }}>
                    <User className="w-4 h-4 inline mr-2" />
                    Service
                  </label>
                  <select
                    data-testid="booking-service-select"
                    value={bookingService}
                    onChange={(e) => setBookingService(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#E2E8F0' }}
                    required
                  >
                    <option value="">Select a service</option>
                    <option value="General Dentistry">General Dentistry</option>
                    <option value="Cosmetic Dentistry">Cosmetic Dentistry</option>
                    <option value="Emergency Care">Emergency Care</option>
                    <option value="Orthodontics">Orthodontics</option>
                    <option value="Cleaning">Cleaning</option>
                  </select>
                </div>
                
                <button
                  data-testid="booking-submit-btn"
                  type="submit"
                  className="w-full py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all duration-200 active:scale-95"
                  style={{ backgroundColor: '#3A8D91', color: '#FFFFFF' }}
                >
                  Book Appointment
                </button>
              </form>
            </div>
            
            {/* Appointments Table */}
            <div className="bg-white rounded-3xl border shadow-sm p-6" style={{ borderColor: '#E2E8F0' }}>
              <h3 className="text-2xl font-semibold mb-6" style={{ fontFamily: 'Outfit, sans-serif', color: '#334155' }}>
                Your Appointments
              </h3>
              
              {appointments.length === 0 ? (
                <p data-testid="no-appointments-message" className="text-center py-8" style={{ color: '#64748B' }}>
                  No appointments yet. Book your first appointment!
                </p>
              ) : (
                <div className="overflow-x-auto" data-testid="appointments-table">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: '#E2E8F0' }}>
                        <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Date</th>
                        <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Time</th>
                        <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Service</th>
                        <th className="text-left py-3 px-4 font-semibold" style={{ color: '#334155' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.map((apt, idx) => (
                        <tr key={idx} data-testid={`appointment-row-${idx}`} className="border-b" style={{ borderColor: '#E2E8F0' }}>
                          <td className="py-3 px-4">{apt.date}</td>
                          <td className="py-3 px-4">{apt.time}</td>
                          <td className="py-3 px-4">{apt.service}</td>
                          <td className="py-3 px-4">
                            <span
                              data-testid={`appointment-status-${idx}`}
                              className="px-3 py-1 rounded-full text-xs font-medium"
                              style={{
                                backgroundColor: apt.status === 'pending' ? '#FEF3C7' : '#D1FAE5',
                                color: apt.status === 'pending' ? '#92400E' : '#065F46'
                              }}
                            >
                              {apt.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;