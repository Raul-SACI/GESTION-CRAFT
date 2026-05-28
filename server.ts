import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Ensure data folder exists
  const DATA_DIR = path.join(process.cwd(), ".data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Helper to read table data
  const readTable = (table: string): any[] => {
    const filePath = path.join(DATA_DIR, `${table}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch (e) {
        console.error(`Error reading mock db file for ${table}:`, e);
      }
    }
    return [];
  };

  // Helper to write table data
  const writeTable = (table: string, data: any[]) => {
    const filePath = path.join(DATA_DIR, `${table}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error(`Error writing mock db file for ${table}:`, e);
    }
  };

  // API endpoints to retrieve and save mock table data
  app.get("/api/mock-db/:table", (req, res) => {
    const { table } = req.params;
    const data = readTable(table);
    res.json({ data });
  });

  app.post("/api/mock-db/:table/save", (req, res) => {
    const { table } = req.params;
    const { data } = req.body;
    if (Array.isArray(data)) {
      writeTable(table, data);
      res.json({ success: true, count: data.length });
    } else {
      res.status(400).json({ error: "Data must be an array" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA routing - Express v4 route handling
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
