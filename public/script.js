const uploadForm = document.getElementById("uploadForm");
const imageInput = document.getElementById("imageInput");
const previewImg = document.getElementById("preview");
const gallery = document.getElementById("gallery");

// Preview Image
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  previewImg.src = URL.createObjectURL(file);
  previewImg.style.display = "block";
});

// Upload Handler
uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = imageInput.files[0];
  if (!file) return alert("Select an image first.");

  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch("/upload-image", { method: "POST", body: formData });
  const data = await res.json();

  if (data.success) {
    alert("Photo uploaded successfully");
    loadGallery();
    imageInput.value = "";
    previewImg.style.display = "none";
  }
});

// Load Gallery
async function loadGallery() {
  gallery.innerHTML = "<p>Loading photos...</p>";

  const res = await fetch("/images");
  const images = await res.json();

  gallery.innerHTML = "";

  images.forEach(img => {
    const card = document.createElement("div");
    card.className = "photo-card";

    card.innerHTML = `
      <img src="${img.imageUrl}">
      <div class="card-actions">
        <button onclick="viewImage('${img._id}')">View</button>
        <button onclick="downloadImage('${img._id}')">Download</button>
        <button onclick="deleteImage('${img._id}')">Delete</button>
      </div>
    `;

    gallery.appendChild(card);
  });
}

function viewImage(id) {
  window.open(`/view/${id}`, "_blank");
}

function downloadImage(id) {
  window.location = `/download/${id}`;
}

async function deleteImage(id) {
  if (!confirm("Delete this photo?")) return;
  const res = await fetch(`/delete-image/${id}`, { method: "DELETE" });
  const data = await res.json();
  if (data.success) {
    loadGallery();
    alert("Deleted");
  } else {
    alert("Failed to delete");
  }
}

loadGallery();
