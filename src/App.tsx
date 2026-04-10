import { useState, useEffect, FormEvent, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Truck, User, Clock, CheckCircle2, AlertCircle, LogOut, Shield, CircleUser, 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Server, Database, Lock,
  Trash2, Edit, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isSameDay, addDays, parse, isWithinInterval, addMinutes,
  isBefore, startOfToday, getDay
} from "date-fns";
import { es } from "date-fns/locale";

interface TruckData {
  id: string;
  name: string;
}

interface Booking {
  id: string;
  truckId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  user: string;
  status: "pending" | "in_progress" | "completed";
  category: "camion" | "recibo";
}

type Role = "chofer" | "agendador" | null;
type Module = "agenda_camion" | "agenda_recibo";

const socket: Socket = io();

export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [activeModule, setActiveModule] = useState<Module>("agenda_camion");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [serviceLayer, setServiceLayer] = useState("");
  const [database, setDatabase] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userSessionId, setUserSessionId] = useState<string | null>(null);
  const [trucks, setTrucks] = useState<TruckData[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    type: "danger" | "primary";
  } | null>(null);

  // Booking Edit State
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  
  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  
  // New Booking State
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");

  // Day Details Modal State
  const [showDayDetailsModal, setShowDayDetailsModal] = useState(false);
  const [selectedDayForDetails, setSelectedDayForDetails] = useState<Date | null>(null);

  useEffect(() => {
    socket.on("init_data", (data: { trucks: TruckData[], bookings: Booking[] }) => {
      setTrucks(data.trucks);
      setBookings(data.bookings);
      if (data.trucks.length > 0) {
        setSelectedTruckId(data.trucks[0].id);
      }
    });

    socket.on("bookings_update", (updatedBookings: Booking[]) => {
      setBookings(updatedBookings);
    });

    socket.on("booking_error", (error: string) => {
      setConfirmConfig({
        title: "Conflicto de Horario",
        message: error,
        onConfirm: () => setShowConfirmModal(false),
        type: "danger"
      });
      setShowConfirmModal(true);
    });

    return () => {
      socket.off("init_data");
      socket.off("bookings_update");
      socket.off("booking_error");
    };
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) {
      setConfirmConfig({
        title: "Rol Requerido",
        message: "Por favor selecciona un rol para continuar",
        onConfirm: () => setShowConfirmModal(false),
        type: "primary"
      });
      setShowConfirmModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/sap/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceLayerUrl: serviceLayer,
          companyDB: database,
          userName,
          password
        })
      });

      const data = await response.json();
      if (data.success) {
        setIsLoggedIn(true);
        setUserSessionId(data.userSessionId);
      } else {
        setConfirmConfig({
          title: "Error de Autenticación",
          message: data.message || "Error de conexión con SAP",
          onConfirm: () => setShowConfirmModal(false),
          type: "danger"
        });
        setShowConfirmModal(true);
      }
    } catch (error) {
      setConfirmConfig({
        title: "Error de Servidor",
        message: "No se pudo conectar con el servidor. Por favor intenta más tarde.",
        onConfirm: () => setShowConfirmModal(false),
        type: "danger"
      });
      setShowConfirmModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (userSessionId) {
      try {
        await fetch("/api/sap/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userSessionId }),
        });
      } catch (error) {
        console.error("Logout error:", error);
      }
    }
    
    setIsLoggedIn(false);
    setRole(null);
    setUserName("");
    setPassword("");
    setServiceLayer("");
    setDatabase("");
    setUserSessionId(null);
  };

  const createBooking = () => {
    if (!selectedTruckId) return;
    
    // Validate times
    if (startTime >= endTime) {
      setConfirmConfig({
        title: "Horario Inválido",
        message: "La hora de inicio debe ser menor a la hora de fin",
        onConfirm: () => setShowConfirmModal(false),
        type: "danger"
      });
      setShowConfirmModal(true);
      return;
    }

    const action = () => {
      socket.emit(editingBookingId ? "update_booking" : "create_booking", {
        id: editingBookingId,
        truckId: selectedTruckId,
        date: format(selectedDate, "yyyy-MM-dd"),
        startTime,
        endTime,
        user: userName,
        category: activeModule === "agenda_camion" ? "camion" : "recibo"
      });
      setShowBookingModal(false);
      setEditingBookingId(null);
    };

    setConfirmConfig({
      title: editingBookingId ? "Confirmar Edición" : "Confirmar Agenda",
      message: `¿Estás seguro que deseas ${editingBookingId ? "editar" : "crear"} esta agenda para el camión ${trucks.find(t => t.id === selectedTruckId)?.name}?`,
      onConfirm: action,
      type: "primary"
    });
    setShowConfirmModal(true);
  };

  const updateStatus = (bookingId: string, status: "pending" | "in_progress" | "completed") => {
    const statusLabels = {
      pending: "Pendiente",
      in_progress: "En Proceso",
      completed: "Completada"
    };

    setConfirmConfig({
      title: "Actualizar Estado",
      message: `¿Deseas cambiar el estado de esta agenda a "${statusLabels[status]}"?`,
      onConfirm: () => socket.emit("update_status", { bookingId, status }),
      type: "primary"
    });
    setShowConfirmModal(true);
  };

  const deleteBooking = (bookingId: string) => {
    setConfirmConfig({
      title: "Eliminar Agenda",
      message: "¿Estás seguro que deseas eliminar esta agenda? Esta acción no se puede deshacer.",
      onConfirm: () => socket.emit("delete_booking", bookingId),
      type: "danger"
    });
    setShowConfirmModal(true);
  };

  const openEditModal = (booking: Booking) => {
    setEditingBookingId(booking.id);
    setSelectedTruckId(booking.truckId);
    setSelectedDate(parse(booking.date, "yyyy-MM-dd", new Date()));
    setStartTime(booking.startTime);
    setEndTime(booking.endTime);
    setShowBookingModal(true);
  };

  // Calendar Helpers
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const bookingsForSelectedDate = useMemo(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return bookings.filter(b => b.date === dateStr && b.truckId === selectedTruckId);
  }, [bookings, selectedDate, selectedTruckId]);

  const timeSlots = useMemo(() => {
    const slots = [];
    let current = parse("00:00", "HH:mm", new Date());
    const end = parse("23:30", "HH:mm", new Date());
    
    while (isBefore(current, addMinutes(end, 1))) {
      slots.push(format(current, "HH:mm"));
      current = addMinutes(current, 30);
    }
    return slots;
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card w-full max-w-md p-8"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <Truck className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-center">SAP B1 - Agenda</h1>
            <p className="text-gray-500 text-sm text-center mt-2">Conexión mediante Service Layer</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Service Layer URL</label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={serviceLayer}
                  onChange={(e) => setServiceLayer(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                  placeholder="https://su-servidor:50000/b1s/v1"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Base de Datos</label>
              <div className="relative">
                <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                  placeholder="SBO_COMPANY_DB"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Usuario</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                    placeholder="manager"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Rol en la Aplicación</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("agendador")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    role === "agendador" 
                      ? "border-primary bg-primary/5 text-primary" 
                      : "border-gray-100 hover:border-gray-200 text-gray-500"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span className="text-xs font-bold">Agendador</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("chofer")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    role === "chofer" 
                      ? "border-primary bg-primary/5 text-primary" 
                      : "border-gray-100 hover:border-gray-200 text-gray-500"
                  }`}
                >
                  <CircleUser className="w-4 h-4" />
                  <span className="text-xs font-bold">Chofer</span>
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="btn-primary w-full py-3 mt-4 text-sm font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Conectar con SAP B1"
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Truck className="w-6 h-6 text-primary" />
              <span className="font-bold text-lg hidden sm:inline">SAP B1 - Logística</span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              <button 
                onClick={() => setActiveModule("agenda_camion")}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeModule === "agenda_camion" ? "bg-primary/10 text-primary" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Agenda de Camiones
              </button>
              <button 
                onClick={() => setActiveModule("agenda_recibo")}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeModule === "agenda_recibo" ? "bg-primary/10 text-primary" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Agenda de Recibo
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold leading-none">{userName}</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                {role === "chofer" ? "Chofer" : "Agendador"}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-3 sm:p-4 mt-2 sm:mt-4">
        {activeModule === "agenda_camion" ? (
          <div className="flex flex-col gap-4">
            {/* Truck Selection - Horizontal Scroll on Mobile */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold flex items-center gap-2 text-gray-500 px-1">
                <Truck className="w-4 h-4" /> SELECCIONAR CAMIÓN
              </h2>
              <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar snap-x">
                {trucks.map(truck => (
                  <button
                    key={truck.id}
                    onClick={() => setSelectedTruckId(truck.id)}
                    className={`flex-shrink-0 snap-start min-w-[160px] text-left p-3 rounded-xl border-2 transition-all ${
                      selectedTruckId === truck.id 
                        ? "border-primary bg-primary/5 text-primary shadow-sm" 
                        : "border-white bg-white text-gray-600"
                    }`}
                  >
                    <div className="font-bold text-sm truncate">{truck.name}</div>
                    <div className="text-[10px] opacity-70">ID: {truck.id}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar & Daily Schedule - Stacked on Mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Calendar Card */}
              <div className="card p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-base capitalize">
                    {format(currentMonth, "MMMM yyyy", { locale: es })}
                  </h3>
                  <div className="flex gap-1">
                    <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["L", "M", "X", "J", "V", "S", "D"].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {days.map((day, idx) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const dayStr = format(day, "yyyy-MM-dd");
                    const dayBookings = bookings.filter(b => b.date === dayStr && b.truckId === selectedTruckId);
                    const pendingCount = dayBookings.filter(b => b.status === "pending").length;

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedDate(day)}
                        className={`
                          aspect-square flex flex-col items-center justify-center rounded-lg text-xs sm:text-sm transition-all relative
                          ${!isCurrentMonth ? "text-gray-300" : "text-gray-700"}
                          ${isSelected ? "bg-primary text-white shadow-md z-10" : "hover:bg-gray-50"}
                          ${isToday && !isSelected ? "border border-primary/30 text-primary font-bold" : ""}
                        `}
                      >
                        <span>{format(day, "d")}</span>
                        {pendingCount > 0 && (
                          <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm z-20 ${isSelected ? "bg-white text-primary" : "bg-amber-500 text-white"}`}>
                            {pendingCount}
                          </div>
                        )}
                        {dayBookings.length > 0 && pendingCount === 0 && !isSelected && (
                          <div className="absolute bottom-1 w-1 h-1 rounded-full bg-gray-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Daily Schedule Card */}
              <div className="card p-4 sm:p-6 flex flex-col min-h-[300px]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-base">Agenda del Día</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-gray-500 capitalize">
                        {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                      </p>
                      {bookingsForSelectedDate.filter(b => b.status === "pending").length > 0 && (
                        <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {bookingsForSelectedDate.filter(b => b.status === "pending").length} Pendientes
                        </span>
                      )}
                    </div>
                  </div>
                  {role === "agendador" && (
                    <button 
                      onClick={() => setShowBookingModal(true)}
                      className="p-2.5 bg-primary text-white rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto max-h-[350px] pr-1 custom-scrollbar">
                  {bookingsForSelectedDate.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <CalendarIcon className="w-10 h-10 mb-2 opacity-20" />
                      <p className="text-xs">Sin reservas para hoy</p>
                    </div>
                  ) : (
                    bookingsForSelectedDate
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map(booking => (
                        <div 
                          key={booking.id} 
                          className={`p-3 rounded-xl border-l-4 transition-all ${
                            booking.status === "completed" 
                              ? "bg-emerald-50 border-emerald-500 opacity-80" 
                              : booking.status === "in_progress"
                                ? "bg-blue-50 border-blue-500"
                                : "bg-amber-50 border-amber-500"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-1.5">
                                <Clock className={`w-3 h-3 ${
                                  booking.status === "completed" ? "text-emerald-500" : 
                                  booking.status === "in_progress" ? "text-blue-500" : "text-amber-500"
                                }`} />
                                <span className="font-bold text-xs">{booking.startTime} - {booking.endTime}</span>
                                <span className={`text-[8px] font-bold px-1 rounded uppercase ${
                                  booking.status === "completed" ? "bg-emerald-100 text-emerald-700" : 
                                  booking.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                                }`}>
                                  {booking.status === "completed" ? "Completado" : 
                                   booking.status === "in_progress" ? "En Proceso" : "Pendiente"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <User className="w-3 h-3 text-gray-400" />
                                <span className="text-[10px] text-gray-600 font-medium">{booking.user}</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {role === "agendador" && booking.status !== "completed" && (
                                <>
                                  <button 
                                    onClick={() => openEditModal(booking)}
                                    className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => deleteBooking(booking.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {role === "chofer" && (
                                <div className="flex gap-1">
                                  {booking.status === "pending" && (
                                    <button 
                                      onClick={() => updateStatus(booking.id, "in_progress")}
                                      className="text-[8px] font-bold bg-blue-500 text-white px-2 py-1 rounded-lg active:scale-95 transition-transform"
                                    >
                                      INICIAR
                                    </button>
                                  )}
                                  {booking.status === "in_progress" && (
                                    <button 
                                      onClick={() => updateStatus(booking.id, "completed")}
                                      className="text-[8px] font-bold bg-emerald-500 text-white px-2 py-1 rounded-lg active:scale-95 transition-transform"
                                    >
                                      FINALIZAR
                                    </button>
                                  )}
                                </div>
                              )}
                              {booking.status === "completed" && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-primary" /> Agenda de Recibo
                </h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Matriz Mensual</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                  <button onClick={prevMonth} className="p-1.5 hover:bg-gray-50 rounded-lg">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-bold text-xs min-w-[100px] text-center capitalize">
                    {format(currentMonth, "MMM yyyy", { locale: es })}
                  </span>
                  <button onClick={nextMonth} className="p-1.5 hover:bg-gray-50 rounded-lg">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {role === "agendador" && (
                  <button 
                    onClick={() => {
                      setSelectedDate(new Date());
                      setShowBookingModal(true);
                    }}
                    className="p-2.5 bg-primary text-white rounded-xl shadow-lg shadow-primary/20"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="card overflow-hidden border-none shadow-lg">
              <div className="grid grid-cols-6 bg-primary text-white">
                {["L", "M", "X", "J", "V", "S"].map(d => (
                  <div key={d} className="p-2 text-center text-[10px] font-bold border-r border-white/10 last:border-0">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-6 auto-rows-[100px] sm:auto-rows-[140px] bg-gray-100 gap-[1px]">
                {days.filter(d => getDay(d) !== 0).map((day, idx) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const dayBookings = bookings.filter(b => b.date === dateStr);
                  const pendingCount = dayBookings.filter(b => b.status === "pending").length;
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div 
                      key={idx} 
                      className={`bg-white p-1 flex flex-col gap-0.5 overflow-hidden ${
                        !isCurrentMonth ? "bg-gray-50/50" : ""
                      } ${isToday ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex justify-between items-center px-0.5">
                        <span className={`text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday ? "bg-primary text-white" : isCurrentMonth ? "text-gray-700" : "text-gray-300"
                        }`}>
                          {format(day, "d")}
                        </span>
                      </div>
                      <div 
                        className="flex-1 flex flex-col items-center justify-center cursor-pointer relative group"
                        onClick={() => {
                          setSelectedDayForDetails(day);
                          setShowDayDetailsModal(true);
                        }}
                      >
                        {pendingCount > 0 && (
                          <div className="flex flex-col items-center justify-center">
                            <span className="text-2xl sm:text-3xl font-black text-amber-500 drop-shadow-sm group-hover:scale-110 transition-transform">
                              {pendingCount}
                            </span>
                            <span className="text-[8px] font-bold text-amber-600 uppercase tracking-tighter -mt-1">
                              Pendientes
                            </span>
                          </div>
                        )}
                        
                        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 pb-1">
                          {dayBookings.slice(0, 4).map(b => (
                            <div 
                              key={b.id} 
                              className={`w-1 h-1 rounded-full ${
                                b.status === "completed" ? "bg-emerald-400" : 
                                b.status === "in_progress" ? "bg-blue-400" : "bg-amber-400"
                              }`} 
                            />
                          ))}
                          {dayBookings.length > 4 && <span className="text-[6px] text-gray-400">+{dayBookings.length - 4}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Booking Modal */}
      <AnimatePresence>
        {showBookingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="card w-full max-w-md p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">{editingBookingId ? "Editar Agenda" : "Nueva Reserva"}</h3>
                <button 
                  onClick={() => {
                    setShowBookingModal(false);
                    setEditingBookingId(null);
                  }} 
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-500">Camión</label>
                  <select 
                    value={selectedTruckId || ""}
                    onChange={(e) => setSelectedTruckId(e.target.value)}
                    className="w-full p-3 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-primary/20 font-bold text-primary"
                  >
                    {trucks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-500">Fecha</label>
                  <div className="font-bold capitalize bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {format(selectedDate, "EEEE d 'de' MMMM, yyyy", { locale: es })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Hora Inicio</label>
                    <select 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full p-3 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {timeSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Hora Fin</label>
                    <select 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full p-3 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {timeSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={createBooking}
                    className="btn-primary w-full py-4 text-lg font-bold shadow-lg shadow-primary/20"
                  >
                    Confirmar Agenda
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Day Details Modal */}
      <AnimatePresence>
        {showDayDetailsModal && selectedDayForDetails && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="card w-full max-w-md p-0 shadow-2xl overflow-hidden"
            >
              <div className="bg-primary p-4 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold">Detalle de Agendas</h3>
                  <p className="text-xs opacity-80">{format(selectedDayForDetails, "EEEE, d 'de' MMMM", { locale: es })}</p>
                </div>
                <button 
                  onClick={() => setShowDayDetailsModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {bookings.filter(b => b.date === format(selectedDayForDetails, "yyyy-MM-dd")).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>No hay agendas para este día</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookings
                      .filter(b => b.date === format(selectedDayForDetails, "yyyy-MM-dd"))
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map(b => {
                        const truck = trucks.find(t => t.id === b.truckId);
                        return (
                          <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                            <div className={`w-2 h-12 rounded-full ${
                              b.status === "completed" ? "bg-emerald-500" : 
                              b.status === "in_progress" ? "bg-blue-500" : "bg-amber-500"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                <span className="text-sm font-bold truncate">{truck?.name || 'Camión Desconocido'}</span>
                                <span className="text-[10px] font-bold text-gray-400">{b.startTime} - {b.endTime}</span>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-500 truncate">Agendado por: {b.user}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  b.status === "completed" ? "bg-emerald-100 text-emerald-700" : 
                                  b.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                                }`}>
                                  {b.status === "completed" ? "Completado" : b.status === "in_progress" ? "En Proceso" : "Pendiente"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <button 
                  onClick={() => setShowDayDetailsModal(false)}
                  className="w-full py-3 rounded-xl bg-white border border-gray-200 font-bold text-gray-600 shadow-sm"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && confirmConfig && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="card w-full max-w-sm p-6 shadow-2xl overflow-hidden relative"
            >
              <div className={`absolute top-0 left-0 right-0 h-1.5 ${confirmConfig.type === 'danger' ? 'bg-red-500' : 'bg-primary'}`} />
              
              <div className="flex flex-col items-center text-center">
                <div className={`p-3 rounded-full mb-4 ${confirmConfig.type === 'danger' ? 'bg-red-50' : 'bg-primary/10'}`}>
                  {confirmConfig.type === 'danger' ? (
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  )}
                </div>
                
                <h3 className="text-xl font-bold mb-2">{confirmConfig.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-8">
                  {confirmConfig.message}
                </p>
                
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button 
                    onClick={() => setShowConfirmModal(false)}
                    className="py-3 px-4 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      confirmConfig.onConfirm();
                      setShowConfirmModal(false);
                    }}
                    className={`py-3 px-4 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 ${
                      confirmConfig.type === 'danger' 
                        ? 'bg-red-500 shadow-red-500/20' 
                        : 'bg-primary shadow-primary/20'
                    }`}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2 lg:hidden z-30">
        <div className="flex justify-around items-center">
          <button 
            onClick={() => setActiveModule("agenda_camion")}
            className={`flex flex-col items-center p-2 ${activeModule === "agenda_camion" ? "text-primary" : "text-gray-400"}`}
          >
            <CalendarIcon className="w-6 h-6" />
            <span className="text-[10px] font-bold mt-1">Camiones</span>
          </button>
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center -mt-8 border-4 border-gray-50 shadow-lg">
            <User className="w-6 h-6 text-white" />
          </div>
          <button 
            onClick={() => setActiveModule("agenda_recibo")}
            className={`flex flex-col items-center p-2 ${activeModule === "agenda_recibo" ? "text-primary" : "text-gray-400"}`}
          >
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-[10px] font-bold mt-1">Recibos</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
