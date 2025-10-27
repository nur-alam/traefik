import express from "express"

const app = express();

app.get('/', (req, res) => {
    res.send('Node app running!! ✅ \n');
});

app.listen( process.env.PORT || 4000, () => console.log("Node app running on port 4000"));
