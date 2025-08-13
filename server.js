const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error MongoDB:', err));

// Config Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer para uploads
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'projecthub', allowedFormats: ['jpg', 'png', 'mp3', 'mp4', 'pdf'] },
});
const upload = multer({ storage });

// Middleware Auth
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token inválido' });
  }
};

// Modelos Mongoose
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: String,
  avatar: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const teamSchema = new mongoose.Schema({
  name: String,
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteLink: { type: String, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const Team = mongoose.model('Team', teamSchema);

const projectSchema = new mongoose.Schema({
  name: String,
  description: String,
  color: String,
  icon: String,
  headerImage: String,
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const Project = mongoose.model('Project', projectSchema);

const taskSchema = new mongoose.Schema({
  name: String,
  description: String,
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  dueDate: Date,
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['pending', 'progress', 'completed'], default: 'pending' },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  location: String,
  chat: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    timestamp: { type: Date, default: Date.now },
    emoji: String
  }],
  notes: String,
  files: [{
    url: String,
    type: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// Rutas Auth
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashed, role });
  await user.save();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password)) return res.status(400).json({ msg: 'Credenciales inválidas' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user });
});

// Rutas Projects (Protegidas)
app.get('/api/projects', authMiddleware, async (req, res) => {
  const projects = await Project.find({ teamId: req.query.teamId });
  res.json(projects);
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  const project = new Project({ ...req.body, createdBy: req.user.id });
  await project.save();
  res.json(project);
});

app.put('/api/projects/:id', authMiddleware, async (req, res) => {
  const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(project);
});

app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
  await Project.findByIdAndDelete(req.params.id);
  res.json({ msg: 'Proyecto eliminado' });
});

// Rutas Tasks (Protegidas)
app.get('/api/tasks', authMiddleware, async (req, res) => {
  const { projectId, teamId } = req.query;
  const filter = {};
  if (projectId) filter.projectId = projectId;
  if (teamId) filter['projectId.teamId'] = teamId; // Filtrar por team si es necesario
  const tasks = await Task.find(filter);
  res.json(tasks);
});

app.post('/api/tasks', authMiddleware, async (req, res) => {
  const task = new Task({ ...req.body, createdBy: req.user.id });
  await task.save();
  res.json(task);
});

app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(task);
});

app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ msg: 'Tarea eliminada' });
});

// Upload File (para tasks o gallery)
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  res.json({ url: req.file.path, type: req.file.mimetype });
});

// Socket.io para Chats en Tiempo Real
io.on('connection', (socket) => {
  socket.on('joinTask', (taskId) => {
    socket.join(taskId);
  });

  socket.on('sendMessage', async ({ taskId, message, emoji }) => {
    const task = await Task.findById(taskId);
    const newMsg = { userId: socket.handshake.query.userId, message, emoji, timestamp: new Date() };
    task.chat.push(newMsg);
    await task.save();
    io.to(taskId).emit('newMessage', newMsg);
  });
});

// Iniciar Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server en puerto ${PORT}`));