// src/layouts/TeacherLayout.jsx
import { useState, useEffect, useRef } from "react";
import { Layout, Menu, Avatar, Dropdown, Badge } from "antd"; 
import {
  MenuFoldOutlined, MenuUnfoldOutlined, DashboardOutlined, ApartmentOutlined,
  BookOutlined, DatabaseOutlined, OrderedListOutlined, FileTextOutlined,
  SearchOutlined, BellOutlined, UserOutlined, SettingOutlined,
  LogoutOutlined, MessageOutlined 
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux"; 
import io from 'socket.io-client'; 

import ChatWidget from "@/components/ChatWidget";
import { ChatApi } from "@/services/api/chatApi"; 
import { ProfileApi } from "@/services/api/profileApi";
import { AuthApi } from "@/services/api/authApi";
import { logout, selectUser, setUser } from "@/redux/authSlice"; 
import "../css/admin-layout.css"; // Có thể tái sử dụng CSS của admin hoặc tạo file riêng teacher-layout.css

const { Header, Sider, Content } = Layout;

export default function TeacherLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0); 
  
  const chatOpenRef = useRef(chatOpen);

  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const currentUser = useSelector(selectUser);

  // Sync state sang ref
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  // Fetch user info & count
  useEffect(() => {
    const fetchLatestUser = async () => {
      if (currentUser) {
        try {
            const freshData = await ProfileApi.getProfile({ mapped: true, prevUser: currentUser });
            if (freshData.avatar !== currentUser.avatar || freshData.name !== currentUser.name) {
                dispatch(setUser(freshData));
            }
        } catch (e) {}
      }
    };
    fetchLatestUser();

    if (currentUser && currentUser.user_id) {
        // Lấy số tin nhắn chưa đọc ban đầu
        ChatApi.getUnreadCount()
          .then((res) => setUnreadCount(res.count))
          .catch((err) => console.error(err));

        const socket = io('https://lms-mankai.onrender.com', {
            query: { userId: currentUser.user_id }
        });

        socket.on('receiveMessage', (newMsg) => {
            if (newMsg.sender.user_id !== currentUser.user_id) {
                if (!chatOpenRef.current) {
                    setUnreadCount(prev => prev + 1);
                }
            }
        });

        return () => socket.disconnect();
    }
  }, [currentUser?.user_id]); 

  // 🟢 MENU CỦA TEACHER (Đã bỏ Quản lý người dùng, đổi path sang /teacher)
  const menuItems = [
    { key: "/teacher", icon: <DashboardOutlined />, label: "Dashboard" },
    { key: "/teacher/classes", icon: <ApartmentOutlined />, label: "Lớp học của tôi" },
    { key: "/teacher/courses", icon: <BookOutlined />, label: "Quản lý khóa học" },
    { key: "question-banks-group", icon: <DatabaseOutlined />, label: "Ngân hàng đề", children: [
        { key: "/teacher/question-banks", icon: <DatabaseOutlined />, label: "Quản lý quiz" },
        { key: "/teacher/questions", icon: <OrderedListOutlined />, label: "Quản lý câu hỏi" },
    ]},
    { key: "/teacher/posts", icon: <FileTextOutlined />, label: "Bài viết" },
    // ĐÃ XÓA MỤC QUẢN LÝ NGƯỜI DÙNG
  ];

  const handleUserMenuClick = async ({ key }) => {
    if (key === "logout") {
      await AuthApi.logout();
      dispatch(logout());
      navigate("/login");
    } 
    else if (key === "profile") navigate("/teacher/profile");
    else if (key === "settings") navigate("/teacher/settings");
  };

  const handleMenuClick = (info) => { 
      // Kiểm tra path teacher
      if (info.key.startsWith("/teacher")) navigate(info.key); 
  };

  const handleOpenChat = () => {
      setChatOpen(true);
  };

  const handleMessageRead = () => {
     setUnreadCount(0);
  };

  const userMenu = {
    items: [
      { key: "profile", label: "Hồ sơ cá nhân", icon: <UserOutlined /> },
      { key: "settings", label: "Cài đặt", icon: <SettingOutlined /> },
      { type: "divider" },
      { key: "logout", label: "Đăng xuất", icon: <LogoutOutlined />, danger: true },
    ],
    onClick: handleUserMenuClick,
  };
  
  const flatKeys = menuItems.flatMap((item) => item.children ? item.children.map((c) => c.key) : item.key);
  // Default về /teacher nếu không match
  const matchedKey = flatKeys.filter((k) => typeof k === "string" && location.pathname.startsWith(k)).sort((a, b) => b.length - a.length)[0] || "/teacher";

  return (
    <Layout className="admin-layout"> 
      {/* Vẫn dùng class admin-layout để tận dụng CSS cũ, hoặc bạn đổi tên class trong CSS file */}
      <Sider width={230} collapsible collapsed={collapsed} trigger={null} className="admin-sider">
        <div className="admin-logo">
          <div className="admin-logo-icon">T</div> {/* Chữ T cho Teacher */}
          {!collapsed && <span className="admin-logo-text">LMS Teacher</span>}
        </div>
        <Menu 
            mode="inline" 
            selectedKeys={[matchedKey]} 
            defaultOpenKeys={["question-banks-group"]} 
            items={menuItems} 
            onClick={handleMenuClick} 
            className="admin-menu" 
        />
      </Sider>

      <Layout className="admin-main">
        <Header className="admin-header">
          <div className="admin-header-left">
            <button className="admin-trigger" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}</button>
            <div className="admin-search"><SearchOutlined className="admin-search-icon" /><input className="admin-search-input" placeholder="Tìm kiếm..." /></div>
          </div>

          <div className="admin-header-right">
            <div className="admin-header-icon" onClick={handleOpenChat} style={{ cursor: 'pointer', marginRight: 10 }}>
                <Badge count={unreadCount} overflowCount={99} size="small"> 
                    <MessageOutlined style={{ fontSize: 20 }} />
                </Badge>
            </div>
            <BellOutlined className="admin-header-icon" />
            <Dropdown menu={userMenu} placement="bottomRight" arrow>
              <div className="admin-user" style={{ cursor: "pointer" }}>
                <Avatar size="small" icon={<UserOutlined />} src={currentUser?.avatar} />
                <span className="admin-user-name">{currentUser?.full_name || currentUser?.name || "Teacher"}</span>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="admin-content"><Outlet /></Content>
      </Layout>

      <ChatWidget 
        open={chatOpen} 
        onClose={() => setChatOpen(false)} 
        currentUser={currentUser}
        onRead={handleMessageRead} 
      />
    </Layout>
  );
}