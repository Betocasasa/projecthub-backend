const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error de conexión:', err));

// Schemas
const projectSchema = new mongoose.Schema({
  name: String,
  description: String,
  color: String,
  headerImg: String
});
const Project = mongoose.model('Project', projectSchema);

const taskSchema = new mongoose.Schema({
  name: String,
  projectId: String,
  location: String,
  date: Date,
  participants: [String],
  status: String,
  chat: [{ user: String, message: String, timestamp: Date }],
  notes: String,
  alarm: Number,
  attachments: [String]
});
const Task = mongoose.model('Task', taskSchema);

const teamSchema = new mongoose.Schema({
  name: String,
  role: String,
  email: String,
  profileImg: String
});
const Team = mongoose.model('Team', teamSchema);

const fundSchema = new mongoose.Schema({
  name: String,
  description: String,
  total: Number,
  contributions: [{ member: String, amount: Number }]
});
const Fund = mongoose.model('Fund', fundSchema);

const gallerySchema = new mongoose.Schema({
  url: String,
  isPrivate: Boolean
});
const Gallery = mongoose.model('Gallery', gallerySchema);

const privateEventSchema = new mongoose.Schema({
  title: String,
  date: Date,
  owner: String
});
const PrivateEvent = mongoose.model('PrivateEvent', privateEventSchema);

// APIs para Projects
app.get('/api/projects', async (req, res) => res.json(await Project.find()));
app.post('/api/projects', async (req, res) => {
  const project = new Project(req.body);
  await project.save();
  res.json(project);
});
app.put('/api/projects/:id', async (req, res) => {
  const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(project);
});

// APIs para Tasks
app.get('/api/tasks', async (req, res) => res.json(await Task.find()));
app.post('/api/tasks', async (req, res) => {
  const task = new Task(req.body);
  await task.save();
  res.json(task);
});
app.put('/api/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(task);
});
app.post('/api/tasks/:id/chat', async (req, res) => {
  const task = await Task.findById(req.params.id);
  task.chat.push({ ...req.body, timestamp: new Date() });
  await task.save();
  res.json(task.chat);
});

// Similar para otros endpoints (team, funds, gallery, privateEvents)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
app.post('/api/upload', upload.single('file'), (req, res) => res.json({ url: `/uploads/${req.file.filename}` }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
