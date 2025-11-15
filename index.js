require("dotenv").config({ path: "./config.env" });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cloud_project';
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Sample schema & model
const ItemSchema = new mongoose.Schema({
  name: String,
  code: { type: String, default: () => nanoid(6) },
});
const Item = mongoose.model('Item', ItemSchema);

// API routes
app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const newItem = new Item({ name: req.body.name });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Optional 404 for unmatched API requests
app.use((req, res) => {
  res.status(404).send('Route not found');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
