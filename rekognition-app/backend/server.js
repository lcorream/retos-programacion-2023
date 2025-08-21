require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { RekognitionClient, DetectFacesCommand, SearchFacesByImageCommand, IndexFacesCommand, DescribeCollectionCommand } = require('@aws-sdk/client-rekognition');
const path = require('path');

const app = express();

// Config
const PORT = process.env.PORT || 3000;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const COLLECTION_ID = process.env.COLLECTION_ID || '';
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE || 85);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Middlewares
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));

// Serve frontend statically
app.use(express.static(path.resolve(__dirname, '../frontend')));

// AWS Rekognition client
const rekognition = new RekognitionClient({ region: AWS_REGION });

function parseBase64Image(imageBase64) {
	if (!imageBase64 || typeof imageBase64 !== 'string') return null;
	const commaIndex = imageBase64.indexOf(',');
	const base64Part = commaIndex !== -1 ? imageBase64.slice(commaIndex + 1) : imageBase64;
	try {
		return Buffer.from(base64Part, 'base64');
	} catch (e) {
		return null;
	}
}

function pickPrimaryEmotion(emotions) {
	if (!Array.isArray(emotions) || emotions.length === 0) return null;
	const sorted = [...emotions].sort((a, b) => (b.Confidence || 0) - (a.Confidence || 0));
	const primary = sorted[0];
	return primary ? { Type: primary.Type, Confidence: primary.Confidence } : null;
}

app.get('/health', (_req, res) => {
	res.json({ ok: true });
});

// Fallback to index.html for root
app.get('/', (req, res) => {
	res.sendFile(path.resolve(__dirname, '../frontend/index.html'));
});

app.post('/analyze', async (req, res) => {
	try {
		const { imageBase64 } = req.body || {};
		const imageBytes = parseBase64Image(imageBase64);
		if (!imageBytes) {
			return res.status(400).json({ error: 'Imagen inválida o faltante' });
		}

		const detectCmd = new DetectFacesCommand({
			Image: { Bytes: imageBytes },
			Attributes: ['ALL']
		});
		const result = await rekognition.send(detectCmd);

		const faces = (result.FaceDetails || []).map(fd => ({
			BoundingBox: fd.BoundingBox,
			Confidence: fd.Confidence,
			Landmarks: fd.Landmarks,
			Emotions: fd.Emotions,
			PrimaryEmotion: pickPrimaryEmotion(fd.Emotions),
			AgeRange: fd.AgeRange,
			Smile: fd.Smile,
			Eyeglasses: fd.Eyeglasses,
			Sunglasses: fd.Sunglasses,
			Gender: fd.Gender,
			Beard: fd.Beard,
			Mustache: fd.Mustache
		}));

		// Clear sensitive buffers
		imageBytes.fill(0);

		res.json({ count: faces.length, faces });
	} catch (err) {
		console.error('Analyze error:', err);
		res.status(500).json({ error: 'Error procesando la imagen' });
	}
});

app.post('/match', async (req, res) => {
	try {
		if (!COLLECTION_ID) {
			return res.status(400).json({ error: 'COLLECTION_ID no configurado en el servidor' });
		}
		const { imageBase64, maxFaces } = req.body || {};
		const imageBytes = parseBase64Image(imageBase64);
		if (!imageBytes) {
			return res.status(400).json({ error: 'Imagen inválida o faltante' });
		}
		const maxFacesNum = Math.min(Number(maxFaces) || 5, 20);

		const matchCmd = new SearchFacesByImageCommand({
			CollectionId: COLLECTION_ID,
			Image: { Bytes: imageBytes },
			MaxFaces: maxFacesNum,
			FaceMatchThreshold: MIN_CONFIDENCE
		});
		const result = await rekognition.send(matchCmd);

		const matches = (result.FaceMatches || [])
			.map(m => ({
				faceId: m.Face && m.Face.FaceId,
				externalImageId: m.Face && m.Face.ExternalImageId,
				similarity: m.Similarity,
				confidence: m.Face && m.Face.Confidence
			}))
			.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

		imageBytes.fill(0);

		res.json({ matches });
	} catch (err) {
		console.error('Match error:', err);
		res.status(500).json({ error: 'Error buscando coincidencias' });
	}
});

app.post('/enroll', async (req, res) => {
	try {
		if (!COLLECTION_ID) {
			return res.status(400).json({ error: 'COLLECTION_ID no configurado en el servidor' });
		}
		const { imageBase64, externalImageId } = req.body || {};
		const imageBytes = parseBase64Image(imageBase64);
		if (!imageBytes) {
			return res.status(400).json({ error: 'Imagen inválida o faltante' });
		}
		if (!externalImageId) {
			return res.status(400).json({ error: 'externalImageId es requerido' });
		}

		const enrollCmd = new IndexFacesCommand({
			CollectionId: COLLECTION_ID,
			Image: { Bytes: imageBytes },
			ExternalImageId: String(externalImageId),
			DetectionAttributes: ['DEFAULT']
		});
		const result = await rekognition.send(enrollCmd);

		const faceRecords = (result.FaceRecords || []).map(fr => ({
			faceId: fr.Face && fr.Face.FaceId,
			imageId: fr.Face && fr.Face.ImageId,
			confidence: fr.Face && fr.Face.Confidence
		}));

		imageBytes.fill(0);

		res.json({ faceRecords });
	} catch (err) {
		console.error('Enroll error:', err);
		res.status(500).json({ error: 'Error inscribiendo el rostro' });
	}
});

app.get('/collection/status', async (_req, res) => {
	if (!COLLECTION_ID) return res.json({ configured: false });
	try {
		const describe = new DescribeCollectionCommand({ CollectionId: COLLECTION_ID });
		const result = await rekognition.send(describe);
		res.json({ configured: true, collection: { CollectionId: COLLECTION_ID, FaceCount: result.FaceCount, FaceModelVersion: result.FaceModelVersion } });
	} catch (err) {
		console.error('Describe collection error:', err);
		res.json({ configured: true, collection: { CollectionId: COLLECTION_ID }, error: 'No se pudo describir la colección' });
	}
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});