"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";

const SECRET_CODE = "family123"; // A simple secret code for now.

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [secretCode, setSecretCode] = useState("");
  const [userName, setUserName] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [error, setError] = useState("");
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isLoggedIn) {
      scrollToBottom();
    }
  }, [messages, isLoggedIn]);

  // Listen for real-time messages
  useEffect(() => {
    if (!isLoggedIn) return;

    // We use a collection called 'family_chat'
    const q = query(collection(db, "family_chat"), orderBy("createdAt", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data({ serverTimestamps: 'estimate' })
      }));
      setMessages(msgs);
    }, (err) => {
      console.error("Firestore Error:", err);
      // Fallback or warning if Firebase is not yet configured
      if (err.message.includes("Missing or insufficient permissions") || err.code === 'permission-denied') {
        setError("Database permissions not configured yet.");
      }
    });

    return () => unsubscribe();
  }, [isLoggedIn]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (secretCode === SECRET_CODE && userName.trim() !== "") {
      setIsLoggedIn(true);
      setError("");
    } else {
      setError("Invalid Secret Code or Name.");
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === "") return;

    const msgText = newMessage.trim();
    setNewMessage(""); // Clear input immediately for better UX

    try {
      await addDoc(collection(db, "family_chat"), {
        text: msgText,
        sender: userName,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error sending message:", err);
      // Revert if failed
      setNewMessage(msgText);
      alert("Failed to send message. Please check if Firebase is configured.");
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "Sending...";
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Family Chat</h1>
          <p>Enter your name and the shared secret code to enter the private chat room.</p>
          
          {error && <div style={{color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem'}}>{error}</div>}
          
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Your Name (e.g., Dad, Son)"
              className="input-field"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Secret Code"
              className="input-field"
              value={secretCode}
              onChange={(e) => setSecretCode(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">
              Enter Chat
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <h2>Family Chat</h2>
        <button onClick={() => setIsLoggedIn(false)} className="logout-btn">Leave</button>
      </header>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{textAlign: 'center', color: '#94a3b8', marginTop: '2rem'}}>
            No messages yet. Say hello!
          </div>
        )}
        
        {messages.map((msg) => {
          const isMe = msg.sender === userName;
          return (
            <div key={msg.id} className={`message-row ${isMe ? 'me' : 'other'}`}>
              <div className="message-bubble">
                {!isMe && <span className="message-sender">{msg.sender}</span>}
                {msg.text}
                <span className="message-time">{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSendMessage} className="chat-form">
          <input
            type="text"
            placeholder="Type your message..."
            className="chat-input"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            required
            autoComplete="off"
          />
          <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
