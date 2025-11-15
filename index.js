require("dotenv").config({ path: "./config.env" });

const express = require("express");
const mongoose = require("mongoose");
const { nanoid } = require("nanoid");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ------------------------------
// MongoDB Connection
// ------------------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));

// ------------------------------
// URL Schema
// ------------------------------
const urlSchema = new mongoose.Schema({
  originalUrl: String,
  shortId: String,
});

const Url = mongoose.model("Url", urlSchema);

// ------------------------------
// API to Shorten URL
// ------------------------------
app.post("/shorten", async (req, res) => {
  try {
    const { originalUrl } = req.body;

    if (!originalUrl) {
      return res.status(400).json({ error: "URL is required" });
    }

    const shortId = nanoid(6);

    await Url.create({ originalUrl, shortId });

    res.json({
      shortUrl: `${process.env.BASE_URL}/${shortId}`,
    });
  } catch (err) {
    console.log("Error in /shorten API:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------------------
// Redirect API
// ------------------------------
app.get("/:shortId", async (req, res) => {
  try {
    const record = await Url.findOne({ shortId: req.params.shortId });

    if (!record) return res.status(404).send("URL not found");

    res.redirect(record.originalUrl);
  } catch (err) {
    console.log("Redirect Error:", err);
    res.status(500).send("Server Error");
  }
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
