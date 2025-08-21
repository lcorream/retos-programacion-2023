const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const output = document.getElementById('output');
const startCameraBtn = document.getElementById('startCamera');
const takePhotoBtn = document.getElementById('takePhoto');
const sendAnalyzeBtn = document.getElementById('sendAnalyze');
const sendMatchBtn = document.getElementById('sendMatch');
const sendEnrollBtn = document.getElementById('sendEnroll');
const externalIdInput = document.getElementById('externalId');
const consentCheckbox = document.getElementById('consentCheckbox');

let currentImageBase64 = null;
let mediaStream = null;

function setButtonsEnabled(enabled) {
	sendAnalyzeBtn.disabled = !enabled;
	sendMatchBtn.disabled = !enabled;
	sendEnrollBtn.disabled = !enabled;
}

function showMessage(obj) {
	output.textContent = JSON.stringify(obj, null, 2);
}

function drawVideoToCanvas() {
	const width = video.videoWidth || 640;
	const height = video.videoHeight || 480;
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(video, 0, 0, width, height);
	currentImageBase64 = canvas.toDataURL('image/jpeg', 0.92);
	preview.src = currentImageBase64;
	setButtonsEnabled(true);
}

async function startCamera() {
	if (!consentCheckbox.checked) {
		alert('Debes aceptar el consentimiento para usar la cámara.');
		return;
	}
	try {
		mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
		video.srcObject = mediaStream;
		takePhotoBtn.disabled = false;
	} catch (e) {
		console.error(e);
		showMessage({ error: 'No se pudo acceder a la cámara' });
	}
}

function stopCamera() {
	if (mediaStream) {
		mediaStream.getTracks().forEach(t => t.stop());
		mediaStream = null;
	}
}

startCameraBtn.addEventListener('click', startCamera);

takePhotoBtn.addEventListener('click', () => {
	if (!video.srcObject) {
		showMessage({ error: 'Cámara no iniciada' });
		return;
	}
	drawVideoToCanvas();
});

fileInput.addEventListener('change', () => {
	const file = fileInput.files && fileInput.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		currentImageBase64 = reader.result;
		preview.src = currentImageBase64;
		setButtonsEnabled(true);
	};
	reader.readAsDataURL(file);
});

async function postJSON(path, body) {
	const baseUrl = (window.BACKEND_URL || '').trim();
	const url = baseUrl ? `${baseUrl}${path}` : path;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		let errText = 'Error en la solicitud';
		try { const data = await res.json(); errText = data && data.error ? data.error : errText; } catch {}
		throw new Error(errText);
	}
	return res.json();
}

sendAnalyzeBtn.addEventListener('click', async () => {
	if (!currentImageBase64) return;
	try {
		const data = await postJSON('/analyze', { imageBase64: currentImageBase64 });
		showMessage(data);
	} catch (e) {
		showMessage({ error: e.message });
	}
});

sendMatchBtn.addEventListener('click', async () => {
	if (!currentImageBase64) return;
	try {
		const data = await postJSON('/match', { imageBase64: currentImageBase64, maxFaces: 5 });
		showMessage(data);
	} catch (e) {
		showMessage({ error: e.message });
	}
});

sendEnrollBtn.addEventListener('click', async () => {
	if (!currentImageBase64) return;
	try {
		const externalImageId = externalIdInput.value.trim();
		const data = await postJSON('/enroll', { imageBase64: currentImageBase64, externalImageId });
		showMessage(data);
	} catch (e) {
		showMessage({ error: e.message });
	}
});

window.addEventListener('beforeunload', () => {
	stopCamera();
});