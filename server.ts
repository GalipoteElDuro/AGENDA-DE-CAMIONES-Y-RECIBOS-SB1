import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // In-memory state
  // Trucks list
  let trucks = [
    { id: "1", name: "Camión 01 - Volvo FH" },
    { id: "2", name: "Camión 02 - Scania R" },
  ];

  // Bookings: { truckId: string, date: string (YYYY-MM-DD), startTime: string (HH:mm), endTime: string (HH:mm), user: string, role: string, finished: boolean }
  let bookings: any[] = [];

  app.use(cors());
  app.use(express.json());

  // SAP B1 Proxy Login
  app.post("/api/sap/login", async (req, res) => {
    const { serviceLayerUrl, companyDB, userName, password } = req.body;
    
    try {
      // In a real scenario, we would call the SAP Service Layer Login endpoint
      // POST {{serviceLayerUrl}}/Login
      // Body: { "CompanyDB": companyDB, "UserName": userName, "Password": password }
      
      console.log(`Intentando login en SAP B1: ${serviceLayerUrl} - DB: ${companyDB}`);
      
      // Simulating a successful SAP response for the demo environment
      // In production, you would use fetch or axios here
      const mockSapResponse = {
        SessionId: "mock-session-id-" + Math.random().toString(36).substr(2),
        Version: "10.0",
        SessionTimeout: 30
      };

      res.json({
        success: true,
        sessionId: mockSapResponse.SessionId,
        user: userName,
        db: companyDB
      });
    } catch (error) {
      console.error("SAP Login Error:", error);
      res.status(401).json({ success: false, message: "Error de autenticación con SAP B1" });
    }
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    
    // Send initial state
    socket.emit("init_data", { trucks, bookings });

    socket.on("create_booking", (newBooking) => {
      // Overlap check: A truck is a physical resource, so we check ALL bookings for that truck
      // regardless of category (camion or recibo)
      const conflictingBooking = bookings.find(b => 
        b.truckId === newBooking.truckId && 
        b.date === newBooking.date &&
        b.status !== "completed" &&
        ((newBooking.startTime >= b.startTime && newBooking.startTime < b.endTime) ||
         (newBooking.endTime > b.startTime && newBooking.endTime <= b.endTime) ||
         (newBooking.startTime <= b.startTime && newBooking.endTime >= b.endTime))
      );

      if (!conflictingBooking) {
        const booking = { 
          ...newBooking, 
          id: Math.random().toString(36).substr(2, 9), 
          status: "pending",
          category: newBooking.category || "camion"
        };
        bookings.push(booking);
        io.emit("bookings_update", bookings);
      } else {
        socket.emit("booking_error", `Conflicto: El camión ya tiene una agenda (${conflictingBooking.category === 'camion' ? 'Camiones' : 'Recibo'}) programada de ${conflictingBooking.startTime} a ${conflictingBooking.endTime} por el usuario ${conflictingBooking.user}.`);
      }
    });

    socket.on("update_status", ({ bookingId, status }) => {
      const index = bookings.findIndex(b => b.id === bookingId);
      if (index !== -1) {
        bookings[index].status = status;
        io.emit("bookings_update", bookings);
      }
    });

    socket.on("delete_booking", (bookingId) => {
      bookings = bookings.filter(b => b.id !== bookingId);
      io.emit("bookings_update", bookings);
    });

    socket.on("update_booking", (updatedBooking) => {
      const index = bookings.findIndex(b => b.id === updatedBooking.id);
      if (index !== -1) {
        // Overlap check for update (excluding self) - Global per truck
        const conflictingBooking = bookings.find(b => 
          b.id !== updatedBooking.id &&
          b.truckId === updatedBooking.truckId && 
          b.date === updatedBooking.date &&
          b.status !== "completed" &&
          ((updatedBooking.startTime >= b.startTime && updatedBooking.startTime < b.endTime) ||
           (updatedBooking.endTime > b.startTime && updatedBooking.endTime <= b.endTime) ||
           (updatedBooking.startTime <= b.startTime && updatedBooking.endTime >= b.endTime))
        );

        if (conflictingBooking) {
          socket.emit("booking_error", `Conflicto: El camión ya tiene una agenda (${conflictingBooking.category === 'camion' ? 'Camiones' : 'Recibo'}) programada de ${conflictingBooking.startTime} a ${conflictingBooking.endTime}.`);
          return;
        }

        bookings[index] = { ...bookings[index], ...updatedBooking };
        io.emit("bookings_update", bookings);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
