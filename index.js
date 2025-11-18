require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));


// ------------------------------------------------------
// 1. CLOUDINARY CONFIG
// ------------------------------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME, 
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});


// ------------------------------------------------------
// 2. MULTER CONFIG (TEMPORARY LOCAL STORAGE)
// ------------------------------------------------------
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});
const upload = multer({ storage });


// ------------------------------------------------------
// 3. DATABASE (RUNS ONLY ON RENDER WITH ENV VARS)
// ------------------------------------------------------
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log("MongoDB Error:", err));
} else {
  console.log("MONGO_URI not found — skipping MongoDB (local development)");
}

// Schema for stored images (Render only)
let ImageModel = null;

if (process.env.MONGO_URI) {
  const imageSchema = new mongoose.Schema({
    imageUrl: String,
    uploadedAt: { type: Date, default: Date.now }
  });

  ImageModel = mongoose.model("Image", imageSchema);
}


// ------------------------------------------------------
// 4. UPLOAD IMAGE API
// ------------------------------------------------------
app.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Upload to Cloudinary
    const uploaded = await cloudinary.uploader.upload(req.file.path, {
      folder: "cloud_project_images",
    });

    let savedImage = null;

    // Save to MongoDB ONLY if available (Render)
    if (ImageModel) {
      savedImage = await ImageModel.create({
        imageUrl: uploaded.secure_url
      });
    }

    res.json({
      success: true,
      message: "Image uploaded successfully",
      imageUrl: uploaded.secure_url,
      id: savedImage ? savedImage._id : null
    });

  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});


// ------------------------------------------------------
// 5. GET ALL IMAGES (ONLY WORKS ON RENDER WITH MONGO)
// ------------------------------------------------------
app.get("/images", async (req, res) => {
  if (!ImageModel) {
    return res.json([]);  // local mode, no DB
  }

  const images = await ImageModel.find().sort({ uploadedAt: -1 });
  res.json(images);
});


// ------------------------------------------------------
// 6. FALLBACK ROUTE (EXPRESS 5 SAFE)
// ------------------------------------------------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
