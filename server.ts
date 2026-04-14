import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { createSapSession, removeSapSession, makeAuthenticatedRequest } from "./src/sap/serviceLayerClient";

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

  // Store active SAP sessions with user mapping
  const userSapSessions = new Map<string, {
    serviceLayerUrl: string;
    companyDB: string;
    userName: string;
    sapSessionId: string;
  }>();

  app.use(cors());
  app.use(express.json());

  /**
   * SAP B1 Service Layer Login
   * Authenticates against real SAP B1 Service Layer
   */
  app.post("/api/sap/login", async (req, res) => {
    const { serviceLayerUrl, companyDB, userName, password } = req.body;

    // Validate required fields
    if (!serviceLayerUrl || !companyDB || !userName || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Todos los campos son requeridos: serviceLayerUrl, companyDB, userName, password" 
      });
    }

    // Validate URL format
    try {
      const url = new URL(serviceLayerUrl);
      if (!url.protocol.startsWith("http")) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return res.status(400).json({ 
        success: false, 
        message: "URL del Service Layer no válida. Ejemplo: https://tu-servidor:50000/b1s/v1" 
      });
    }

    // Generate a unique user session ID for tracking
    const userSessionId = `${userName}_${Date.now()}`;

    try {
      console.log(`[SAP Login] Intentando conexión a: ${serviceLayerUrl} - DB: ${companyDB} - Usuario: ${userName}`);

      // Real SAP B1 Service Layer authentication
      const sapSession = await createSapSession(userSessionId, {
        serviceLayerUrl,
        companyDB,
        userName,
        password,
      });

      // Store session mapping
      userSapSessions.set(userSessionId, {
        serviceLayerUrl,
        companyDB,
        userName,
        sapSessionId: sapSession.sessionId,
      });

      console.log(`[SAP Login] Exitoso - Session ID: ${sapSession.sessionId.substring(0, 20)}...`);

      res.json({
        success: true,
        sessionId: sapSession.sessionId,
        userSessionId,
        user: userName,
        db: companyDB,
        version: sapSession.version,
        sessionTimeout: sapSession.sessionTimeout,
      });
    } catch (error: any) {
      console.error("[SAP Login Error]", error.message);

      // Parse SAP B1 error messages
      let errorMessage = "Error de conexión con SAP B1";
      let statusCode = 500;

      if (error.message?.includes("ECONNREFUSED") || error.message?.includes("ENOTFOUND")) {
        errorMessage = "Servidor SAP inalcanzable. Verifica la URL y que el Service Layer esté activo.";
        statusCode = 503;
      } else if (error.message?.includes("401") || error.message?.toLowerCase().includes("invalid")) {
        errorMessage = "Credenciales inválidas. Verifica usuario, contraseña y Base de Datos.";
        statusCode = 401;
      } else if (error.message?.includes("timeout")) {
        errorMessage = "Tiempo de espera agotado al conectar con SAP.";
        statusCode = 504;
      } else if (error.message) {
        errorMessage = error.message;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        error: error.message
      });
    }
  });

  /**
   * SAP B1 Service Layer Logout
   */
  app.post("/api/sap/logout", async (req, res) => {
    const { userSessionId } = req.body;

    if (!userSessionId) {
      return res.status(400).json({ success: false, message: "userSessionId is required" });
    }

    try {
      await removeSapSession(userSessionId);
      userSapSessions.delete(userSessionId);
      
      console.log(`[SAP Logout] Sesión cerrada para: ${userSessionId}`);
      
      res.json({ success: true, message: "Logout exitoso" });
    } catch (error: any) {
      console.error("[SAP Logout Error]", error.message);
      res.status(500).json({ success: false, message: "Error al cerrar sesión" });
    }
  });

  /**
   * SAP B1 Service Layer Proxy
   * Allows frontend to make authenticated requests to any SAP endpoint
   */
  app.post("/api/sap/request", async (req, res) => {
    const { userSessionId, method, endpoint, body } = req.body;

    if (!userSessionId || !method || !endpoint) {
      return res.status(400).json({ 
        success: false, 
        message: "userSessionId, method y endpoint son requeridos" 
      });
    }

    const session = userSapSessions.get(userSessionId);
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "Sesión no encontrada. Por favor inicia sesión nuevamente." 
      });
    }

    try {
      const response = await makeAuthenticatedRequest(userSessionId, method, endpoint, body);
      
      const data = await response.json().catch(() => null);
      
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message: data?.error?.message?.value || `Error: ${response.status} ${response.statusText}`,
          data,
        });
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("[SAP Request Error]", error.message);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Error en la petición a SAP B1" 
      });
    }
  });

  /**
   * Get Business Partners from SAP B1
   */
  app.get("/api/sap/business-partners", async (req, res) => {
    const { userSessionId } = req.query;

    if (!userSessionId) {
      return res.status(400).json({ success: false, message: "userSessionId is required" });
    }

    const session = userSapSessions.get(userSessionId as string);
    if (!session) {
      return res.status(401).json({ success: false, message: "Sesión no encontrada" });
    }

    try {
      const response = await makeAuthenticatedRequest(
        userSessionId as string,
        "GET",
        "BusinessPartners?$select=CardCode,CardName,CardType&$top=100"
      );

      const data = await response.json();
      res.json({ success: true, data: data.value || [] });
    } catch (error: any) {
      console.error("[SAP BusinessPartners Error]", error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * Get Purchase Orders from SAP B1 for receipt scheduling
   * Smart filter modes:
   * - open: only open orders (default)
   * - relevant: open orders with positive total
   * - all: includes open and closed orders
   */
  app.get("/api/sap/purchase-orders", async (req, res) => {
    const { userSessionId, startDate, endDate, mode = "open" } = req.query as {
      userSessionId?: string;
      startDate?: string;
      endDate?: string;
      mode?: "open" | "relevant" | "all";
    };

    if (!userSessionId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "userSessionId, startDate y endDate son requeridos",
      });
    }

    const session = userSapSessions.get(userSessionId);
    if (!session) {
      return res.status(401).json({ success: false, message: "Sesión no encontrada" });
    }

    const dateRangeFilter = `DocDueDate ge '${startDate}' and DocDueDate le '${endDate}'`;
    const openFilter = "DocStatus eq 'bost_Open'";
    const relevantFilter = "DocStatus eq 'bost_Open' and DocTotal gt 0";

    const combinedFilter = mode === "all"
      ? dateRangeFilter
      : mode === "relevant"
        ? `${dateRangeFilter} and ${relevantFilter}`
        : `${dateRangeFilter} and ${openFilter}`;

    const endpoint = `PurchaseOrders?$filter=${combinedFilter}&$select=DocEntry,DocNum,CardName,DocDueDate,DocTotal,DocStatus&$orderby=DocDueDate asc&$top=300`;

    try {
      const response = await makeAuthenticatedRequest(
        userSessionId,
        "GET",
        endpoint
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message: data?.error?.message?.value || "Error consultando órdenes de compra en SAP",
          data,
        });
      }

      res.json({
        success: true,
        data: data?.value || [],
      });
    } catch (error: any) {
      console.error("[SAP PurchaseOrders Error]", error.message);
      res.status(500).json({ success: false, message: error.message });
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
