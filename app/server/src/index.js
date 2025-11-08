import express from 'express';

const app = express();
app.use(express.json());

// Render the main UI page
app.get('/', (req, res) => {
	res.send(`Hello Universe! Port: ${process.env.PORT || 3000}`);
});

// Render the health check endpoint
app.get('/api/health', (req, res) => {
	res.send(`Healthy! Port: ${process.env.PORT || 3000}`);
});

app.listen(process.env.PORT || 3000, () => {
	console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
