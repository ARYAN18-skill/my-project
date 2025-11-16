require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { nanoid } = require("nanoid");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend FIRST
app.use(express.static(path.join(__dirname, "public")));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));

// Schema
const urlSchema = new mongoose.Schema({
  originalUrl: String,
  shortId: String
});

const Url = mongoose.model("Url", urlSchema);

// Shorten URL API
app.post("/shorten", async (req, res) => {
  const { originalUrl } = req.body;

  if (!originalUrl) {
    return res.status(400).json({ error: "URL is required" });
  }

  const shortId = nanoid(6);
  await Url.create({ originalUrl, shortId });

  res.json({
    shortUrl: `${process.env.BASE_URL}/${shortId}`
  });
});

// Redirect API
app.get("/:shortId", async (req, res) => {
  const record = await Url.findOne({ shortId: req.params.shortId });

  if (!record) {
    return res.status(404).send("URL not found");
  }

  res.redirect(record.originalUrl);
});

// Fallback — load frontend (NOT 404)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
