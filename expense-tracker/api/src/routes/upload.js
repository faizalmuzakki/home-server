import { Router } from 'express';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../data/uploads');

// Ensure upload directory exists
async function ensureUploadDir() {
    if (!existsSync(UPLOAD_DIR)) {
        await mkdir(UPLOAD_DIR, { recursive: true });
    }
}

// Upload image and return URL
router.post('/', async (req, res) => {
    try {
        const { image, filename } = req.body; // base64 encoded image

        if (!image) {
            return res.status(400).json({ error: 'Image is required (base64)' });
        }

        await ensureUploadDir();

        // Generate unique filename
        const timestamp = Date.now();
        const ext = detectExtension(image);
        const finalFilename = filename || `receipt_${timestamp}.${ext}`;
        const filepath = path.join(UPLOAD_DIR, finalFilename);

        // Decode and save
        const buffer = Buffer.from(image, 'base64');
        await writeFile(filepath, buffer);

        // Return the URL path
        const imageUrl = `/uploads/${finalFilename}`;

        res.json({
            success: true,
            image_url: imageUrl,
            filename: finalFilename
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

function detectExtension(base64) {
    if (base64.startsWith('/9j/')) return 'jpg';
    if (base64.startsWith('iVBOR')) return 'png';
    if (base64.startsWith('R0lGOD')) return 'gif';
    if (base64.startsWith('UklGR')) return 'webp';
    return 'jpg'; // default
}

export default router;
