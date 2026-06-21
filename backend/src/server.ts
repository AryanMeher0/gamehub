import express from "express";
import healthRouter from "./routes/health";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "GameHub API", status: "running" });
});

app.use("/api", healthRouter);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
