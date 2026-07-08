"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { 
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp,
  doc, setDoc, getDoc, updateDoc, deleteDoc
} from "firebase/firestore";

const SECRET_CODE = "family123";

// WebRTC Configuration
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [secretCode, setSecretCode] = useState("");
  const [userName, setUserName] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [error, setError] = useState("");
  
  // WebRTC State
  const [callActive, setCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  
  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  
  const pc = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isLoggedIn) scrollToBottom();
  }, [messages, isLoggedIn]);

  // Listen for messages & incoming calls
  useEffect(() => {
    if (!isLoggedIn) return;

    // Chat messages
    const q = query(collection(db, "family_chat"), orderBy("createdAt", "asc"));
    const unsubChat = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data({ serverTimestamps: 'estimate' })
      }));
      setMessages(msgs);
    });

    // Incoming calls
    const callDoc = doc(db, "calls", "family_room");
    const unsubCall = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      
      // If there is an offer and we didn't create it, it's an incoming call
      if (data?.offer && data.caller !== userName && !callActive) {
        setIncomingCall(data);
      }
      
      // If we are the caller and someone answered
      if (data?.answer && pc.current && !pc.current.currentRemoteDescription) {
        const rtcSessionDescription = new RTCSessionDescription(data.answer);
        pc.current.setRemoteDescription(rtcSessionDescription);
      }

      // If call is cleared
      if (!data && callActive) {
         hangup(false); // Remote hung up
      }
    });

    return () => {
      unsubChat();
      unsubCall();
    };
  }, [isLoggedIn, userName, callActive]);

  // Attach media streams to video elements once they are rendered
  useEffect(() => {
    if (callActive) {
      if (localVideoRef.current && localStream.current) {
        localVideoRef.current.srcObject = localStream.current;
      }
      if (remoteVideoRef.current && remoteStream.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
      }
    }
  }, [callActive]);

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
    setNewMessage(""); 
    try {
      await addDoc(collection(db, "family_chat"), {
        text: msgText,
        sender: userName,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setNewMessage(msgText);
    }
  };

  // WebRTC Setup
  const setupMedia = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      remoteStream.current = new MediaStream();
      
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream.current;

      pc.current = new RTCPeerConnection(servers);
      
      localStream.current.getTracks().forEach((track) => {
        pc.current.addTrack(track, localStream.current);
      });

      pc.current.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.current.addTrack(track);
        });
      };
    } catch (error) {
      console.error("Error accessing media devices.", error);
      alert("Could not access camera/microphone. Please allow permissions.");
      throw error;
    }
  };

  const startCall = async () => {
    try {
      await setupMedia();
      setCallActive(true);

      const callDoc = doc(db, "calls", "family_room");
      const offerCandidates = collection(callDoc, "offerCandidates");
      const answerCandidates = collection(callDoc, "answerCandidates");

      // Get candidates for caller, save to db
      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(offerCandidates, event.candidate.toJSON());
        }
      };

      // Create offer
      const offerDescription = await pc.current.createOffer();
      await pc.current.setLocalDescription(offerDescription);

      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
      };

      await setDoc(callDoc, { offer, caller: userName });

      // Listen for remote answer
      onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!pc.current.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.current.setRemoteDescription(answerDescription);
        }
      });

      // Listen for remote ICE candidates
      onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.current.addIceCandidate(candidate);
          }
        });
      });
    } catch (error) {
      console.error("Error starting call", error);
      hangup(true);
    }
  };

  const answerCall = async () => {
    try {
      await setupMedia();
      setCallActive(true);
      setIncomingCall(null);

      const callDoc = doc(db, "calls", "family_room");
      const offerCandidates = collection(callDoc, "offerCandidates");
      const answerCandidates = collection(callDoc, "answerCandidates");

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(answerCandidates, event.candidate.toJSON());
        }
      };

      const callData = (await getDoc(callDoc)).data();
      const offerDescription = callData.offer;
      await pc.current.setRemoteDescription(new RTCSessionDescription(offerDescription));

      const answerDescription = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answerDescription);

      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      };

      await updateDoc(callDoc, { answer });

      onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.current.addIceCandidate(candidate);
          }
        });
      });
    } catch (error) {
      console.error("Error answering call", error);
      hangup(true);
    }
  };

  const hangup = async (isLocal = true) => {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    
    setCallActive(false);
    setIncomingCall(null);

    if (isLocal) {
      try {
        const callDoc = doc(db, "calls", "family_room");
        await deleteDoc(callDoc);
      } catch (e) {
        console.error("Error deleting call doc", e);
      }
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Family Chat</h1>
          <p>Enter your name and the shared secret code.</p>
          {error && <div style={{color: '#ef4444', marginBottom: '1rem'}}>{error}</div>}
          <form onSubmit={handleLogin}>
            <input type="text" placeholder="Your Name" className="input-field" value={userName} onChange={(e) => setUserName(e.target.value)} required />
            <input type="password" placeholder="Secret Code" className="input-field" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} required />
            <button type="submit" className="btn-primary">Enter Chat</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <h2>Family Chat</h2>
        <div style={{display: 'flex', gap: '10px'}}>
          {!callActive && <button onClick={startCall} className="btn-call">📞 Video Call</button>}
          {callActive && <button onClick={() => hangup(true)} className="btn-hangup">End Call</button>}
          <button onClick={() => setIsLoggedIn(false)} className="logout-btn">Leave</button>
        </div>
      </header>

      {incomingCall && !callActive && (
        <div className="incoming-call-banner">
          <p>Incoming call from <strong>{incomingCall.caller}</strong>...</p>
          <div>
            <button onClick={answerCall} className="btn-answer">Accept</button>
            <button onClick={() => hangup(true)} className="btn-decline">Decline</button>
          </div>
        </div>
      )}

      {callActive && (
        <div className="video-container">
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
        </div>
      )}

      <div className="chat-messages">
        {messages.map((msg) => {
          const isMe = msg.sender === userName;
          return (
            <div key={msg.id} className={`message-row ${isMe ? 'me' : 'other'}`}>
              <div className="message-bubble">
                {!isMe && <span className="message-sender">{msg.sender}</span>}
                {msg.text}
                <span className="message-time">{msg.createdAt ? msg.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "..."}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSendMessage} className="chat-form">
          <input type="text" placeholder="Type your message..." className="chat-input" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} required autoComplete="off" />
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
