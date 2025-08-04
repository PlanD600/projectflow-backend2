// src/server.js
require('dotenv').config();
const cors = require('cors');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

// ייבוא נתיבי ה-API השונים
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const userTeamRoutes = require('./routes/userTeamRoutes');
const financeRoutes = require('./routes/financeRoutes');
const chatRoutes = require('./routes/chatRoutes');
const organizationRoutes = require('./routes/organizationRoutes'); // **ייבוא חדש**

// ייבוא שירותי התראות ותזמון
const notificationService = require('./services/notificationService');
const { startDeadlineScheduler } = require('./jobs/deadlineScheduler'); // ייבוא חדש

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // אפשר להגביל לכתובת הספציפית של ה-frontend בייצור
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
  }
});

// אתחול שירות ההתראות עם מופע ה-Socket.IO
notificationService.initNotifications(io); // חובה להפעיל זאת לפני כל שימוש ב-notificationService

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
// 1. הפעלת CORS - חייב להיות לפני הגדרת ה-routes
//app.use(cors()); 
const corsOptions = {
    origin: 'https://mypland.com',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // כל השיטות הנדרשות
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'], // כל הכותרות הנדרשות
};
// 2. הפעלת JSON parser
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// --- Routes ---
app.get('/', (req, res) => {
  res.send('Welcome to ProjectFlow Backend!');
});

app.get('/test-db', async (req, res) => {
  try {
    await prisma.$connect();
    res.status(200).json({ message: 'Successfully connected to the database!' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ message: 'Failed to connect to the database.', error: error.message });
  } finally {
    //
  }
});

// שימוש בנתיבי ה-API
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', userTeamRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/conversations', chatRoutes);
app.use('/api/organizations', organizationRoutes); // **שימוש בנתיב החדש**

// --- Socket.IO Real-time Communication ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('register_for_notifications', (userId) => {
    if (typeof userId !== 'string' || userId.trim() === '') {
      console.warn(`Invalid userId for notification registration received from ${socket.id}:`, userId);
      return;
    }
    socket.join(userId);
    console.log(`${socket.id} (user ${userId}) registered for notifications.`);
  });

  socket.on('join_conversation', (conversationId) => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      console.warn(`Invalid conversationId received from ${socket.id}:`, conversationId);
      return;
    }
    socket.join(conversationId);
    console.log(`${socket.id} joined conversation room: ${conversationId}`);
  });

  socket.on('send_message', async (payload) => {
    console.log(`Message received from ${socket.id}:`, payload);
    try {
        const { conversationId, text, senderId } = payload;

        if (!conversationId || !text || !senderId) {
            console.error('Invalid message payload:', payload);
            socket.emit('error_message', { message: 'Missing data in message payload.' });
            return;
        }

        const newMessage = await prisma.message.create({
            data: {
                conversationId: conversationId,
                senderId: senderId,
                text: text,
            },
            include: {
                sender: {
                    select: { id: true, fullName: true, profilePictureUrl: true }
                }
            }
        });

        io.to(conversationId).emit('new_message', {
            id: newMessage.id,
            sender: {
              id: newMessage.sender.id,
              fullName: newMessage.sender.fullName,
              profilePictureUrl: newMessage.sender.profilePictureUrl
            },
            text: newMessage.text,
            timestamp: newMessage.createdAt.toISOString(),
            conversationId: newMessage.conversationId
        });

    } catch (error) {
        console.error('Error handling send_message:', error);
        socket.emit('error_message', { message: 'Failed to send message.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// הפעלת לוחות זמנים (Cron Jobs)
startDeadlineScheduler(); // שורה חדשה: הפעלת ה-scheduler

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access it at https://api.mypland.com:${PORT}`);
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit();
});