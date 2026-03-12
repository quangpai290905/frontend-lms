// src/components/ChatWidget.jsx
import { useEffect, useState, useRef } from 'react';
import { Avatar, Input, Button, Badge, Image } from 'antd';
import { 
  SendOutlined, UserOutlined, CloseOutlined, 
  ArrowLeftOutlined, PictureOutlined, LoadingOutlined
} from '@ant-design/icons';
import io from 'socket.io-client';
import { ChatApi } from '@/services/api/chatApi';
import { UploadApi } from '@/services/api/uploadApi'; 
import "@/css/messenger.css"; 

const socket = io('http://https://lms-mankai.onrender.com'); 

export default function ChatWidget({ open, onClose, currentUser, onRead }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [contacts, setContacts] = useState([]); 
  const [activeConv, setActiveConv] = useState(null); 
  const [viewMode, setViewMode] = useState('list'); 

  const isStudent = currentUser?.roles?.includes('student') || currentUser?.role === 'student';

  // 1. Khởi tạo dữ liệu (Chạy 1 lần khi có user, không phụ thuộc open)
  useEffect(() => {
    if (currentUser) {
        if (isStudent) {
            // Học viên: Mặc định vào view chat
            if (messages.length === 0) initStudentChat();
            setViewMode('chat');
        } else {
            // Giảng viên: Luôn tải danh sách sidebar để cập nhật realtime
            initTeacherChat();
            setViewMode('list');
        }
    }
  }, [currentUser]); 

  // 2. Lắng nghe Socket (Luôn chạy dù đóng hay mở widget)
  useEffect(() => {
    socket.on('receiveMessage', (newMsg) => {
      const convId = newMsg.conversation.id;
      const currentActiveId = activeConv?.id || activeConv?.conversation_id;

      // A. Nếu đang mở cuộc hội thoại này (Active Chat)
      if (currentActiveId === convId) {
        setMessages((prev) => [...prev, newMsg]);
        
        // Nếu Widget đang mở (open=true) VÀ tin nhắn từ người khác
        if (open && newMsg.sender.user_id !== currentUser.user_id) {
             // Đánh dấu đã đọc ngay lập tức
             ChatApi.markRead(convId);
             // Báo ra ngoài (Home/AdminLayout) để xóa Badge tổng
             if (onRead) onRead(); 
        } 
        
        // Chỉ scroll nếu đang mở
        if (open) {
            setTimeout(scrollToBottom, 100);
        }
      }

      // B. Cập nhật danh sách bên ngoài (Cho Giáo viên/Admin)
      if (!isStudent) {
         updateTeacherSidebar(newMsg, currentActiveId, open);
      }
    });

    return () => { socket.off('receiveMessage'); };
  }, [activeConv, currentUser, isStudent, onRead, open]); 

  // Hàm xử lý khi bấm vào ô nhập liệu (Focus)
  const handleInputFocus = () => {
    if (activeConv) {
        const convId = activeConv.id || activeConv.conversation_id;
        // 1. Gọi API báo đã đọc
        ChatApi.markRead(convId);
        
        // 2. Xóa Badge tổng ở icon bên ngoài
        if (onRead) onRead();
        
        // 3. Xóa chấm đỏ trong danh sách contacts (nếu là Teacher)
        if (!isStudent) {
            setContacts(prev => prev.map(c => 
                (c.conversation_id === convId) ? { ...c, unread: 0 } : c
            ));
        }
    }
  };

  const initStudentChat = async () => {
      try {
          const conversation = await ChatApi.connectSupport();
          setActiveConv(conversation); 
          setMessages(conversation.messages || []);
          socket.emit('joinRoom', conversation.id);
      } catch (error) { console.error(error); }
  };

  const initTeacherChat = async () => {
      try { const data = await ChatApi.getSidebar(); setContacts(data); } catch (e) {}
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };

  // Logic cập nhật Sidebar cho Teacher khi có tin mới
  const updateTeacherSidebar = (newMsg, currentActiveId, isChatOpen) => {
      setContacts((prev) => {
        const convId = newMsg.conversation.id;
        const existingIndex = prev.findIndex(c => c.conversation_id === convId);
        
        // Tăng unread khi: Tin nhắn người khác gửi ĐẾN VÀ (Widget đóng HOẶC Đang xem chat khác)
        const isNotViewing = !isChatOpen || currentActiveId !== convId;
        const shouldIncreaseUnread = newMsg.sender.user_id !== currentUser.user_id && isNotViewing;

        if (existingIndex > -1) {
            const oldItem = prev[existingIndex];
            const updatedItem = {
                ...oldItem,
                last_msg: newMsg.type === 'image' ? '[Hình ảnh]' : newMsg.content,
                last_time: new Date(),
                unread: shouldIncreaseUnread ? (oldItem.unread || 0) + 1 : 0
            };
            // Đưa tin nhắn mới lên đầu
            const newList = [...prev];
            newList.splice(existingIndex, 1);
            return [updatedItem, ...newList];
        } else {
            // Nếu là người mới chưa có trong list -> Load lại
            initTeacherChat(); 
            return prev;
        }
      });
  }

  const handleSend = (content = inputValue, type = 'text') => {
    if (!content.trim() && type === 'text') return;
    if (!activeConv || !currentUser) return;

    // Khi gửi tin -> Coi như đã đọc
    handleInputFocus();

    const convId = activeConv.id || activeConv.conversation_id;
    socket.emit('sendMessage', {
      conversationId: convId, senderId: currentUser.user_id, content: content, type: type
    });
    if (type === 'text') setInputValue("");
  };

  const handleImageSelect = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
          setIsUploading(true);
          const res = await UploadApi.uploadImage(file);
          if (res && res.secure_url) handleSend(res.secure_url, 'image');
      } catch (error) { console.error(error); } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = null; 
      }
  };

  const handleTeacherSelectContact = async (contact) => {
      // Khi chọn user từ danh sách -> Xóa unread của user đó
      setContacts(prev => prev.map(c => c.conversation_id === contact.conversation_id ? { ...c, unread: 0 } : c));
      
      // Nếu user này đang có tin chưa đọc -> Xóa badge tổng bên ngoài luôn
      if (contact.unread > 0 && onRead) {
           onRead(); 
      }
      
      setActiveConv(contact);
      setViewMode('chat'); 
      const conversation = await ChatApi.initConversation(contact.partner_id);
      setMessages(conversation.messages || []);
      socket.emit('joinRoom', conversation.id);
      setTimeout(scrollToBottom, 200);
  };

  const handleBackToList = () => { setViewMode('list'); setActiveConv(null); };

  // 🟢 QUAN TRỌNG: Không dùng "if (!open) return null" nữa để component luôn sống (alive)
  // Dùng CSS để ẩn hiện
  return (
    <div className="chat-widget-container" style={{ display: open ? 'flex' : 'none' }}>
      <div className="chat-widget-header">
        {!isStudent && viewMode === 'chat' && (
             <Button type="text" icon={<ArrowLeftOutlined style={{color: '#fff'}}/>} onClick={handleBackToList} />
        )}
        <div className="header-title">{viewMode === 'list' ? 'Tin nhắn' : (activeConv?.full_name || 'Hỗ trợ')}</div>
        <div className="header-actions"><CloseOutlined onClick={onClose} style={{cursor: 'pointer'}} /></div>
      </div>

      {!isStudent && viewMode === 'list' && (
          <div className="chat-widget-body list-mode">
              {contacts.map(c => (
                  <div key={c.conversation_id} className="widget-contact-item" onClick={() => handleTeacherSelectContact(c)}>
                      <Badge dot={c.unread > 0} color="red"><Avatar src={c.avatar} icon={<UserOutlined />} size={40} /></Badge>
                      <div className="widget-contact-info">
                          <div className="name">{c.full_name}</div>
                          <div className={`preview ${c.unread > 0 ? 'unread' : ''}`}>{c.last_msg || "Bắt đầu trò chuyện"}</div>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {viewMode === 'chat' && (
          <div className="chat-widget-body chat-mode">
             <div className="messages-list">
                 {messages.map((msg, index) => {
                     const isMine = msg.sender.user_id === currentUser.user_id;
                     const isImg = msg.type === 'image' || (msg.content && msg.content.match(/\.(jpeg|jpg|gif|png)$/i));
                     return (
                         <div key={index} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}>
                             <div className="msg-content">
                                 {isImg ? <Image src={msg.content} width={120} style={{borderRadius: 8}} preview={{mask:false}}/> : <span className="msg-text">{msg.content}</span>}
                             </div>
                         </div>
                     )
                 })}
                 <div ref={messagesEndRef} />
             </div>
             <div className="chat-input-area">
                 <input type="file" ref={fileInputRef} style={{display: 'none'}} accept="image/*" onChange={handleImageSelect} />
                 <Button type="text" icon={isUploading ? <LoadingOutlined /> : <PictureOutlined />} onClick={() => fileInputRef.current.click()} disabled={isUploading} />
                 
                 {/* 🟢 Sự kiện quan trọng: onFocus */}
                 <Input 
                    value={inputValue} 
                    onChange={(e) => setInputValue(e.target.value)} 
                    onPressEnter={() => handleSend()} 
                    onFocus={handleInputFocus} 
                    placeholder="Nhập tin nhắn..." 
                    bordered={false} 
                 />
                 
                 <Button type="text" icon={<SendOutlined style={{color: '#1890ff'}} />} onClick={() => handleSend()} />
             </div>
          </div>
      )}
    </div>
  );
}