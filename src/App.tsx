import { useState, useEffect, useCallback, FormEvent, useMemo } from "react";
import { 
  Truck, User, Clock, CheckCircle2, LogOut, Shield,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Server, Database, Lock,
  Trash2, Edit, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isSameDay, parse, addMinutes, isBefore, getDay
} from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "./lib/supabase";

// Utility: truncate long supplier names from SAP
const poTitle = (name: string) => name?.length > 30 ? name.substring(0, 28) + "…" : (name || "Proveedor SAP");


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
  isSap?: boolean;
  docNum?: string | number;
  materialType?: "carga_ligera" | "carga_estandar" | "carga_pesada";
}

type Role = "chofer" | "agendador" | null;
type Module = "agenda_camion" | "agenda_recibo";
type BookingStatus = Booking["status"];
type LoadState = "libre" | "medio" | "ocupado";
type ReceiptFilterMode = "open" | "relevant" | "all";

interface SapPurchaseOrder {
  DocEntry: number;
  DocNum: number;
  CardName: string;
  DocDueDate: string;
  DocTotal: number;
  DocStatus: "bost_Open" | "bost_Close" | string;
}

// Supabase real-time channel placeholder
let bookingsChannel: any = null;

const DAY_START_MINUTES = 6 * 60;
const DAY_END_MINUTES = 22 * 60;
const DAILY_CAPACITY_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;

const toDateTimeMs = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

const getBookingRange = (booking: Pick<Booking, "date" | "startTime" | "endTime">) => ({
  startMs: toDateTimeMs(booking.date, booking.startTime),
  endMs: toDateTimeMs(booking.date, booking.endTime),
});

const hasTimeOverlap = (
  source: Pick<Booking, "date" | "startTime" | "endTime">,
  target: Pick<Booking, "date" | "startTime" | "endTime">
) => {
  const sourceRange = getBookingRange(source);
  const targetRange = getBookingRange(target);
  return sourceRange.startMs < targetRange.endMs && sourceRange.endMs > targetRange.startMs;
};

const getBusyMinutes = (dayBookings: Booking[]) => (
  dayBookings.reduce((total, booking) => {
    const startMinutes = Math.max(
      DAY_START_MINUTES,
      Number.parseInt(booking.startTime.slice(0, 2), 10) * 60 + Number.parseInt(booking.startTime.slice(3, 5), 10)
    );
    const endMinutes = Math.min(
      DAY_END_MINUTES,
      Number.parseInt(booking.endTime.slice(0, 2), 10) * 60 + Number.parseInt(booking.endTime.slice(3, 5), 10)
    );

    return total + Math.max(0, endMinutes - startMinutes);
  }, 0)
);

const getLoadState = (dayBookings: Booking[]): LoadState => {
  if (dayBookings.length === 0) return "libre";

  const loadRatio = getBusyMinutes(dayBookings) / DAILY_CAPACITY_MINUTES;
  if (loadRatio >= 0.7 || dayBookings.length >= 4) return "ocupado";
  if (loadRatio >= 0.35 || dayBookings.length >= 2) return "medio";
  return "libre";
};


export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [activeModule, setActiveModule] = useState<Module>("agenda_camion");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [serviceLayer, setServiceLayer] = useState(localStorage.getItem("sap_url") || "");
  const [database, setDatabase] = useState(localStorage.getItem("sap_db") || "");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userSessionId, setUserSessionId] = useState<string | null>(null);
  const [trucks, setTrucks] = useState<TruckData[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sapBookings, setSapBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [receiptFilterMode, setReceiptFilterMode] = useState<ReceiptFilterMode>("open");
  
  // New Booking State
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    type: "danger" | "primary";
    showCancel?: boolean;
    confirmLabel?: string;
  } | null>(null);

  // Booking Edit State
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  
  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [calendarTruckFilterId, setCalendarTruckFilterId] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  
  // Day Details Modal State
  const [showDayDetailsModal, setShowDayDetailsModal] = useState(false);
  const [selectedDayForDetails, setSelectedDayForDetails] = useState<Date | null>(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // Fetch Trucks from Supabase (or fallback to hardcoded if table doesn't exist yet)
        const { data: trucksData, error: trucksError } = await supabase.from('trucks').select('*');
        if (!trucksError && trucksData && trucksData.length > 0) {
          setTrucks(trucksData);
          setSelectedTruckId(trucksData[0].id);
          setCalendarTruckFilterId(trucksData[0].id);
        } else {
          // Fallback initial trucks
          const fallbackTrucks = [
            { id: "1", name: "Camión 01 - Volvo FH" },
            { id: "2", name: "Camión 02 - Scania R" },
          ];
          setTrucks(fallbackTrucks);
          setSelectedTruckId(fallbackTrucks[0].id);
          setCalendarTruckFilterId(fallbackTrucks[0].id);
        }

        // Fetch Bookings from Supabase
        const { data: bookingsData } = await supabase.from('bookings').select('*');
        if (bookingsData) {
          setBookings(bookingsData);
        }
      } catch (err) {
        console.error("Error fetching initial data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const fetchSapOrders = useCallback(async () => {
    if (!isLoggedIn || !userSessionId || activeModule !== "agenda_recibo") return;
    
    setIsLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      
      const params = new URLSearchParams({
        userSessionId,
        startDate: start,
        endDate: end,
        mode: receiptFilterMode,
      });

      const response = await fetch(`/api/sap/purchase-orders?${params.toString()}`);
      
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        const mapped = result.data.map((po: SapPurchaseOrder) => ({
          id: po.DocEntry.toString(),
          truckId: "sap",
          date: po.DocDueDate?.includes("T") ? po.DocDueDate.split("T")[0] : po.DocDueDate,
          startTime: "00:00",
          endTime: "23:59",
          user: po.CardName,
          status: po.DocStatus === "bost_Open" ? "pending" : "completed",
          category: "recibo" as const,
          isSap: true,
          docNum: po.DocNum,
          materialType: po.DocTotal >= 10000 ? "carga_pesada" : po.DocTotal >= 3000 ? "carga_estandar" : "carga_ligera",
        }));
        setSapBookings(mapped);
      } else {
        setSapBookings([]);
      }
    } catch (error) {
      console.error("Error fetching SAP orders:", error);
      setSapBookings([]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, userSessionId, activeModule, currentMonth, receiptFilterMode]);

  useEffect(() => {
    if (activeModule === "agenda_recibo") {
      fetchSapOrders();
    }
  }, [activeModule, currentMonth, isLoggedIn, receiptFilterMode, fetchSapOrders]);

  useEffect(() => {
    // Set up Supabase Realtime
    bookingsChannel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBookings(prev => [...prev, payload.new as Booking]);
          } else if (payload.eventType === 'DELETE') {
            setBookings(prev => prev.filter(b => b.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setBookings(prev => prev.map(b => b.id === payload.new.id ? payload.new as Booking : b));
          }
        }
      )
      .subscribe();

    return () => {
      if (bookingsChannel) supabase.removeChannel(bookingsChannel);
    };
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      // 1. Authenticate with SAP via our server proxy
      const sapResponse = await fetch("/api/sap/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceLayerUrl: serviceLayer,
          companyDB: database,
          userName,
          password
        })
      });

      const sapData = await sapResponse.json();

      if (!sapResponse.ok || !sapData.success) {
        throw new Error(sapData.message || "Credenciales de SAP B1 inválidas.");
      }

      // 2. Authenticate with Supabase
      // We use a shadow email format for consistency across SAP/Supabase
      const { data: sbData, error: sbError } = await supabase.auth.signInWithPassword({
        email: `${userName.toLowerCase()}@sap.local`,
        password: password,
      });

      if (sbError) {
        console.warn("Supabase Auth Error:", sbError.message);
        // Phase 4 will handle auto-registration if SAP succeeds but SB doesn't yet have the user
      }

      // 3. Success state
      localStorage.setItem("sap_url", serviceLayer);
      localStorage.setItem("sap_db", database);
      localStorage.setItem("user_session", sapData.userSessionId);
      
      setUserSessionId(sapData.userSessionId);
      setRole(sapData.userRole || "agendador");
      setIsLoggedIn(true);
      setSuccessMessage("Conexión exitosa con SAP y Supabase");
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (error: any) {
      setConfirmConfig({
        title: "Fallo de Autenticación",
        message: error.message || "No se pudo establecer conexión con el sistema.",
        onConfirm: () => setShowConfirmModal(false),
        type: "danger",
        showCancel: false,
        confirmLabel: "Reintentar"
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

  const findBookingConflict = useCallback(async (
    bookingPayload: Pick<Booking, "truckId" | "date" | "startTime" | "endTime">
  ) => {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, truckId, date, startTime, endTime, user, status, category")
      .eq("truckId", bookingPayload.truckId)
      .eq("date", bookingPayload.date);

    if (error) throw error;

    return (data || []).find((booking) => (
      booking.id !== (editingBookingId || "") &&
      hasTimeOverlap(bookingPayload, booking as Booking)
    )) as Booking | undefined;
  }, [editingBookingId]);

  const createBooking = async () => {
    if (!selectedTruckId) return;
    
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

    const bookingPayload = {
      truckId: selectedTruckId,
      date: format(selectedDate, "yyyy-MM-dd"),
      startTime,
      endTime,
      user: userName,
      category: activeModule === "agenda_camion" ? "camion" : "recibo"
    };

    setIsLoading(true);
    try {
      const conflicting = await findBookingConflict(bookingPayload);

      if (conflicting) {
        setConfirmConfig({
          title: "Conflicto Logístico",
          message: `El camión ya tiene una tarea asignada de ${conflicting.startTime} a ${conflicting.endTime}.`,
          onConfirm: () => setShowConfirmModal(false),
          type: "danger"
        });
        setShowConfirmModal(true);
        return;
      }

      if (editingBookingId) {
        const { error } = await supabase.from('bookings').update(bookingPayload).eq('id', editingBookingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bookings').insert({ ...bookingPayload, status: "pending" });
        if (error) throw error;
      }
      setShowBookingModal(false);
      setEditingBookingId(null);
      setSuccessMessage("Agenda sincronizada con éxito");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error("Supabase error:", e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (bookingId: string, status: BookingStatus) => {
    try {
      await supabase.from('bookings').update({ status }).eq('id', bookingId);
    } catch (e) {
      console.error("Update error:", e);
    }
  };

  const deleteBooking = async (bookingId: string) => {
    setConfirmConfig({
      title: "Eliminar Agenda",
      message: "¿Estás seguro que deseas eliminar esta agenda? Esta acción no se puede deshacer.",
      onConfirm: async () => {
        try {
          await supabase.from('bookings').delete().eq('id', bookingId);
          setSuccessMessage("Reserva eliminada local y remotamente");
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (e) { console.error(e); }
      },
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

  const filteredTruckBookings = useMemo(() => (
    bookings.filter((booking) => (
      !calendarTruckFilterId || booking.truckId === calendarTruckFilterId
    ))
  ), [bookings, calendarTruckFilterId]);

  const dayDetailBookings = useMemo(() => {
    if (!selectedDayForDetails) return [];

    const dateStr = format(selectedDayForDetails, "yyyy-MM-dd");
    const dayManual = bookings.filter((booking) => (
      booking.date === dateStr && (!calendarTruckFilterId || booking.truckId === calendarTruckFilterId)
    ));
    const daySap = sapBookings.filter((booking) => booking.date === dateStr);

    return [...dayManual, ...daySap].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [bookings, sapBookings, selectedDayForDetails, calendarTruckFilterId]);

  const openDayDetails = (day: Date) => {
    setSelectedDate(day);
    setSelectedDayForDetails(day);
    setShowDayDetailsModal(true);
  };

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

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] flex flex-col font-sans text-gray-900 pb-20 lg:pb-0 selection:bg-primary/20">
      {!isLoggedIn ? (
        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
          {/* Animated Background Elements - Optimized for Performance */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none opacity-50">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[80px] animate-pulse" style={{ willChange: 'transform, opacity' }} />
            <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-blue-400/20 rounded-full blur-[60px] animate-pulse" style={{ animationDelay: '1s', willChange: 'transform, opacity' }} />
            <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] bg-indigo-400/20 rounded-full blur-[70px] animate-pulse" style={{ animationDelay: '2s', willChange: 'transform, opacity' }} />
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            style={{ willChange: 'transform, opacity' }}
            className="glass w-full max-w-md p-8 sm:p-10 rounded-[2rem] shadow-2xl relative"
          >
            <div className="flex flex-col items-center mb-10">
              <div className="bg-primary shadow-xl shadow-primary/30 p-4 rounded-2xl mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-500">
                <Truck className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">AGENDAO SB1</h1>
              <p className="text-slate-500 font-medium text-sm text-center mt-2 px-6">Accede al sistema de logística conectando con SAP Service Layer</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Service Layer URL</label>
                <div className="relative group">
                  <Server className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  <input
                    type="url"
                    value={serviceLayer}
                    onChange={(e) => setServiceLayer(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white/50 focus:bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                    placeholder="https://servidor:50000/b1s/v1"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Base de Datos</label>
                <div className="relative group">
                  <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white/50 focus:bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                    placeholder="SBO_COMPANY_DB"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Usuario</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white/50 focus:bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                      placeholder="manager"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Contraseña</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white/50 focus:bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full py-4 mt-6 flex items-center justify-center gap-3 overflow-hidden relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="relative z-10">Conectar con SAP B1</span>
                    <ChevronRight className="w-5 h-5 relative z-10 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/20 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Powered by Antigravity Design System</p>
            </div>
          </motion.div>
        </div>
      ) : (
        <>
          <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 transition-all">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                  <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-base sm:text-lg leading-tight tracking-tight">AGENDAO SB1</span>
                    <span className="text-[10px] sm:text-[11px] font-bold text-primary uppercase tracking-widest opacity-80">Logística & Control</span>
                  </div>
                </div>
                
                <nav className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl">
                  <button 
                    onClick={() => setActiveModule("agenda_camion")}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                      activeModule === "agenda_camion" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Agenda de Camiones
                  </button>
                  <button 
                    onClick={() => setActiveModule("agenda_recibo")}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                      activeModule === "agenda_recibo" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Agenda de Recibo
                  </button>
                </nav>
              </div>

              <div className="flex items-center gap-3 sm:gap-5">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-bold text-slate-900">{userName}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${role === 'chofer' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">
                      {role === "chofer" ? "Chofer" : "Agendador"}
                    </span>
                  </div>
                </div>
                <div className="h-8 w-[1px] bg-slate-200 hidden sm:block" />
                <button 
                  onClick={handleLogout}
                  className="p-2.5 sm:p-3 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm active:scale-95 group"
                >
                  <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto p-4 sm:p-6 mt-4 pb-24 lg:pb-12">
            {activeModule === "agenda_camion" ? (
              <div className="flex flex-col gap-6 animate-fade-in">
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-black flex items-center gap-2 text-slate-400 uppercase tracking-[0.2em]">
                      <Truck className="w-4 h-4" /> SELECCIONAR UNIDAD
                    </h2>
                  </div>
                  <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar snap-x">
                    {trucks.map(truck => (
                      <button
                        key={truck.id}
                        onClick={() => {
                          setSelectedTruckId(truck.id);
                          setCalendarTruckFilterId(truck.id);
                        }}
                        className={`truck-card flex-shrink-0 snap-start min-w-[210px] p-6 rounded-[2rem] border-2 group ${
                          calendarTruckFilterId === truck.id 
                            ? "selected border-primary bg-primary text-white shadow-xl shadow-primary/20" 
                            : "border-white bg-white text-slate-600 hover:border-slate-200 shadow-md sm:shadow-sm"
                        }`}
                      >
                        <div className="font-extrabold text-base mb-1">{truck.name}</div>
                        <div className={`text-[10px] font-bold uppercase tracking-widest ${calendarTruckFilterId === truck.id ? "text-white/60" : "text-slate-400"}`}>
                          ID: {truck.id}
                        </div>
                        <div className={`mt-4 w-8 h-8 rounded-lg flex items-center justify-center ${calendarTruckFilterId === truck.id ? "bg-white/20" : "bg-slate-100"}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${calendarTruckFilterId === truck.id ? "bg-white" : "bg-slate-400"}`} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  <div className="lg:col-span-5 card p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                      <div>
                        <h3 className="font-extrabold text-xl capitalize">{format(currentMonth, "MMMM yyyy", { locale: es })}</h3>
                        <div className="flex items-center gap-2 mt-2">
                           <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.15em]">Unidad:</span>
                           <select 
                             value={calendarTruckFilterId || 'all'} 
                             onChange={(e) => setCalendarTruckFilterId(e.target.value === 'all' ? null : e.target.value)}
                             className="text-[10px] font-bold border-none bg-slate-100 rounded-md py-1 px-2 focus:ring-0 cursor-pointer"
                           >
                             <option value="all">Todas las Unidades</option>
                             {trucks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                           </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={prevMonth} className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95">
                          <ChevronLeft className="w-5 h-5 text-slate-600" />
                        </button>
                        <button onClick={nextMonth} className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95">
                          <ChevronRight className="w-5 h-5 text-slate-600" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {["L", "M", "X", "J", "V", "S", "D"].map(d => (
                        <div key={d} className="text-center text-[10px] font-black text-slate-300 py-1">{d}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                      {days.map((day, idx) => {
                        const isSelected = isSameDay(day, selectedDate);
                        const isToday = isSameDay(day, new Date());
                        const isCurrentMonth = isSameMonth(day, currentMonth);
                        const dayStr = format(day, "yyyy-MM-dd");
                        const dayBookings = filteredTruckBookings.filter(b => 
                          b.date === dayStr && 
                          (!calendarTruckFilterId || b.truckId === calendarTruckFilterId)
                        );
                        const loadState = getLoadState(dayBookings);
                        const busyMinutes = getBusyMinutes(dayBookings);
                        const loadPercent = Math.min(100, Math.round((busyMinutes / DAILY_CAPACITY_MINUTES) * 100));
                        
                        const hasPending = dayBookings.some(b => b.status === "pending");
                        const hasCompleted = dayBookings.some(b => b.status === "completed");

                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              if (!isCurrentMonth) return;
                              if (window.innerWidth < 1024) {
                                openDayDetails(day);
                                return;
                              }
                              setSelectedDate(day);
                            }}
                            className={`
                              calendar-cell aspect-square flex flex-col items-center justify-center rounded-2xl text-sm relative overflow-hidden border-2 border-transparent
                              ${!isCurrentMonth ? "opacity-10 cursor-default" : "cursor-pointer"}
                              ${isSelected ? "bg-primary text-white shadow-lg shadow-primary/30 z-10 border-primary/40" : "hover:bg-slate-50 text-slate-700"}
                              ${isToday && !isSelected ? "border-amber-500/20 text-amber-600" : ""}
                            `}
                            disabled={!isCurrentMonth}
                            title={`Carga ${loadState}`}
                            aria-label={`${format(day, "d")} - carga ${loadState}`}
                          >
                            <span className="font-bold">{format(day, "d")}</span>
                            <div className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                              isSelected
                                ? "bg-white"
                                : loadState === "ocupado"
                                  ? "bg-rose-500"
                                  : loadState === "medio"
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                            }`} />
                            <div className={`mt-1 h-1.5 w-10 rounded-full ${isSelected ? "bg-white/20" : "bg-slate-100"}`}>
                              <div
                                className={`h-full rounded-full ${
                                  isSelected
                                    ? "bg-white"
                                    : loadState === "ocupado"
                                      ? "bg-rose-500"
                                      : loadState === "medio"
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.max(dayBookings.length > 0 ? 18 : 0, loadPercent)}%` }}
                              />
                            </div>
                            <div className="flex gap-1 mt-1">
                              {hasPending && <div className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-rose-500"}`} />}
                              {hasCompleted && <div className={`w-1 h-1 rounded-full ${isSelected ? "bg-white/60" : "bg-emerald-500"}`} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="hidden lg:flex lg:col-span-7 card p-6 sm:p-8 flex-col min-h-[500px]">
                    <div className="flex items-start justify-between mb-8 pb-1">
                      <div>
                        <h3 className="font-extrabold text-xl tracking-tight">Agenda del Día</h3>
                        <div className="flex items-center gap-2 text-slate-400 mt-1.5">
                          <CalendarIcon className="w-4 h-4 opacity-70" />
                          <span className="text-[10px] font-black uppercase tracking-widest">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span>
                        </div>
                      </div>
                      {role === "agendador" && (
                        <button 
                          onClick={() => setShowBookingModal(true)}
                          className="w-11 h-11 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 active:scale-95 group flex items-center justify-center"
                        >
                          <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                      {bookingsForSelectedDate.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-4">
                            <CalendarIcon className="w-12 h-12 opacity-20" />
                          </div>
                          <p className="text-xs font-black uppercase tracking-widest opacity-40">Sin reservas registradas</p>
                        </div>
                      ) : (
                        bookingsForSelectedDate
                          .sort((a, b) => a.startTime.localeCompare(b.startTime))
                          .map(booking => (
                            <div 
                              key={booking.id} 
                              className={`p-5 rounded-[1.5rem] border transition-all duration-300 ${
                                booking.status === "completed" 
                                  ? "bg-slate-50 border-slate-200 opacity-60" 
                                  : "bg-white border-slate-100 shadow-sm hover:shadow-md"
                              }`}
                            >
                              <div className="flex justify-between items-center gap-4">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                      booking.status === "completed" ? "bg-success/10 text-success" : 
                                      booking.status === "in_progress" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"
                                    }`}>
                                      <Clock className="w-3.5 h-3.5" />
                                      {booking.startTime} - {booking.endTime}
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                      booking.status === "completed" ? "text-success" : 
                                      booking.status === "in_progress" ? "text-primary animate-pulse" : "text-warning"
                                    }`}>
                                      {booking.status === "completed" ? "Completado" : 
                                       booking.status === "in_progress" ? "En Proceso" : "Pendiente"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-white shadow-sm">
                                      {booking.user.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-sm font-bold text-slate-700">{booking.user}</span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {role === "agendador" && booking.status !== "completed" && (
                                    <>
                                      <button onClick={() => openEditModal(booking)} className="p-2.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all">
                                        <Edit className="w-4.5 h-4.5" />
                                      </button>
                                      <button onClick={() => deleteBooking(booking.id)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                        <Trash2 className="w-4.5 h-4.5" />
                                      </button>
                                    </>
                                  )}
                                  
                                  {role === "chofer" && (
                                    <div className="flex gap-2">
                                      {booking.status === "pending" && (
                                        <button 
                                          onClick={() => updateStatus(booking.id, "in_progress")}
                                          className="text-[10px] font-black bg-primary text-white px-5 py-2.5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all uppercase tracking-widest"
                                        >
                                          INICIAR
                                        </button>
                                      )}
                                      {booking.status === "in_progress" && (
                                        <button 
                                          onClick={() => updateStatus(booking.id, "completed")}
                                          className="text-[10px] font-black bg-success text-white px-5 py-2.5 rounded-xl shadow-lg shadow-success/20 hover:shadow-success/40 active:scale-95 transition-all uppercase tracking-widest"
                                        >
                                          FINALIZAR
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  
                                  {booking.status === "completed" && (
                                    <div className="bg-success text-white p-2 rounded-xl">
                                      <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="lg:hidden card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-extrabold text-lg tracking-tight">Detalle rápido</h3>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mt-1">
                        {calendarTruckFilterId
                          ? trucks.find((truck) => truck.id === calendarTruckFilterId)?.name
                          : "Todas las unidades"}
                      </p>
                    </div>
                    <button
                      onClick={() => openDayDetails(selectedDate)}
                      className="btn-secondary px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em]"
                    >
                      Ver agenda
                    </button>
                  </div>
                  <div className="rounded-[1.5rem] bg-slate-50 border border-slate-100 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold capitalize">
                        {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {getLoadState(bookingsForSelectedDate)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {bookingsForSelectedDate.slice(0, 3).map((booking) => (
                        <div key={booking.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 border border-slate-100">
                          <div>
                            <div className="text-sm font-bold text-slate-700">{booking.user}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              {booking.startTime} - {booking.endTime}
                            </div>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                            booking.status === "completed"
                              ? "text-emerald-600"
                              : booking.status === "in_progress"
                                ? "text-primary"
                                : "text-amber-600"
                          }`}>
                            {booking.status === "completed" ? "Completado" : booking.status === "in_progress" ? "En proceso" : "Pendiente"}
                          </span>
                        </div>
                      ))}
                      {bookingsForSelectedDate.length === 0 && (
                        <p className="text-center py-5 text-sm font-bold text-slate-400">Sin reservas para este dia.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 px-1">
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight">Agenda de Recibo</h2>
                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em] font-black mt-1">Planificación Logística de Entrada</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setReceiptFilterMode("open")}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] border transition-all ${
                          receiptFilterMode === "open"
                            ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                            : "bg-white text-slate-500 border-slate-200"
                        }`}
                      >
                        Abiertas
                      </button>
                      <button
                        onClick={() => setReceiptFilterMode("relevant")}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] border transition-all ${
                          receiptFilterMode === "relevant"
                            ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                            : "bg-white text-slate-500 border-slate-200"
                        }`}
                      >
                        Relevantes
                      </button>
                      <button
                        onClick={() => setReceiptFilterMode("all")}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] border transition-all ${
                          receiptFilterMode === "all"
                            ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                            : "bg-white text-slate-500 border-slate-200"
                        }`}
                      >
                        Todas
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                      <button onClick={prevMonth} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                        <ChevronLeft className="w-5 h-5 text-slate-600" />
                      </button>
                      <span className="px-6 font-extrabold text-sm min-w-[160px] text-center capitalize text-slate-700">
                        {format(currentMonth, "MMMM yyyy", { locale: es })}
                      </span>
                      <button onClick={nextMonth} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                      </button>
                    </div>
                    {role === "agendador" && (
                      <button 
                        onClick={() => { setSelectedDate(new Date()); setShowBookingModal(true); }}
                        className="p-4 bg-primary text-white rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      Carga ligera
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
                      Carga estandar
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
                      Carga pesada
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-amber-600" />
                      Orden SAP
                    </span>
                  </div>
                </div>

                <div className="card overflow-hidden border-none shadow-2xl">
                  <div className="grid grid-cols-6 bg-primary text-white">
                    {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"].map(d => (
                      <div key={d} className="p-5 text-center text-[10px] font-black border-r border-white/10 last:border-0 tracking-[0.2em]">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-6 auto-rows-[120px] sm:auto-rows-[180px] bg-slate-200 gap-[1px]">
                    {days.filter(d => getDay(d) !== 0).map((day, idx) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const manualBookings = bookings.filter(b => b.date === dateStr && b.category === "recibo");
                      const sapOrdersForDay = sapBookings.filter(b => b.date === dateStr);
                      const allDayBookings = [...manualBookings, ...sapOrdersForDay];
                      
                      const pendingCount = allDayBookings.filter(b => b.status === "pending").length;
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      const isToday = isSameDay(day, new Date());

                      return (
                        <div 
                          key={idx} 
                          className={`bg-white p-3 flex flex-col group relative cursor-pointer overflow-hidden border-r border-b border-slate-100 last:border-r-0 ${
                            !isCurrentMonth ? "bg-slate-50/50 opacity-30" : "hover:bg-slate-50"
                          }`}
                          onClick={() => {
                            if (isCurrentMonth) {
                              setSelectedDayForDetails(day);
                              setShowDayDetailsModal(true);
                            }
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <span className={`text-xs font-black w-7 h-7 flex items-center justify-center rounded-xl transition-all ${
                              isToday ? "bg-primary text-white shadow-lg shadow-primary/30" : isCurrentMonth ? "text-slate-700 bg-slate-100 group-hover:bg-white" : "text-slate-300"
                            }`}>
                              {format(day, "d")}
                            </span>
                            <div className="flex items-center gap-1">
                              {sapOrdersForDay.some((b) => b.materialType === "carga_pesada") && <span className="inline-block h-2 w-2 rounded-full bg-rose-500" title="Carga pesada" />}
                              {sapOrdersForDay.some((b) => b.materialType === "carga_estandar") && <span className="inline-block h-2 w-2 rounded-full bg-amber-500" title="Carga estandar" />}
                              {sapOrdersForDay.some((b) => b.materialType === "carga_ligera") && <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Carga ligera" />}
                              {sapOrdersForDay.length > 0 && (
                                <div className="bg-amber-100 text-amber-700 p-1 rounded-md" title="Orden de SAP">
                                  <Database className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex-1 flex flex-col items-center justify-center">
                            {pendingCount > 0 ? (
                              <div className="flex flex-col items-center justify-center animate-in zoom-in duration-300">
                                <span className="text-4xl font-black text-warning leading-none">{pendingCount}</span>
                                <span className="text-[8px] font-black text-warning uppercase tracking-widest mt-1">PENDIENTES</span>
                              </div>
                            ) : allDayBookings.length > 0 ? (
                              <div className="bg-success/10 p-2.5 rounded-2xl">
                                <CheckCircle2 className="w-7 h-7 text-success opacity-40" />
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-auto flex justify-center gap-1">
                            {allDayBookings.slice(0, 4).map(b => (
                              <div key={b.id} className={`w-1.5 h-1.5 rounded-full ${b.status === 'completed' ? 'bg-success' : 'bg-warning'} ${b.isSap ? 'border border-white shadow-sm' : ''}`} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </main>

          <nav className="fixed bottom-0 left-0 right-0 glass border-t border-slate-200 p-3 lg:hidden z-[100]">
            <div className="flex justify-around items-center max-w-md mx-auto">
              <button 
                onClick={() => setActiveModule("agenda_camion")}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all ${activeModule === "agenda_camion" ? "text-primary bg-primary/5" : "text-slate-400"}`}
              >
                <Truck className="w-6 h-6" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Camiones</span>
              </button>
              
              <div className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center -mt-10 border-[6px] border-slate-50 shadow-2xl shadow-primary/40 relative">
                <Shield className="w-6 h-6" />
              </div>

              <button 
                onClick={() => setActiveModule("agenda_recibo")}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all ${activeModule === "agenda_recibo" ? "text-primary bg-primary/5" : "text-slate-400"}`}
              >
                <CheckCircle2 className="w-6 h-6" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Recibos</span>
              </button>
            </div>
          </nav>

          <AnimatePresence>
            {showBookingModal && (
              <div className="modal-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, y: "20%", scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: "20%", scale: 0.98 }}
                  transition={{ 
                    duration: 0.4, 
                    ease: [0.22, 1, 0.36, 1]
                  }}
                  className="card w-full max-w-md overflow-hidden relative rounded-t-[2.5rem] sm:rounded-[2.5rem] pb-8 sm:pb-0 shadow-2xl"
                >
                  <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-4 sm:hidden" />
                  <div className="p-8 pt-4 sm:pt-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">{editingBookingId ? "Editar Agenda" : "Nueva Reserva"}</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Planificación para el camión seleccionado</p>
                      </div>
                      <button onClick={() => { setShowBookingModal(false); setEditingBookingId(null); }} className="p-2 bg-slate-50 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Fecha de agenda</label>
                        <div className="relative group">
                          <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <input
                            type="date"
                            value={format(selectedDate, "yyyy-MM-dd")}
                            onChange={(e) => setSelectedDate(parse(e.target.value, "yyyy-MM-dd", new Date()))}
                            className="w-full pl-12 pr-4 py-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all font-bold text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Unidad de Transporte</label>
                        <div className="relative group">
                          <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <select 
                            value={selectedTruckId || ""}
                            onChange={(e) => setSelectedTruckId(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all font-bold text-sm appearance-none"
                          >
                            {trucks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Hora Inicio</label>
                          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full p-4 rounded-[1.25rem] border border-slate-200 bg-white font-bold text-sm focus:ring-4 focus:ring-primary/10 outline-none">
                            {timeSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Hora Fin</label>
                          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full p-4 rounded-[1.25rem] border border-slate-200 bg-white font-bold text-sm focus:ring-4 focus:ring-primary/10 outline-none">
                            {timeSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="pt-6">
                        <button onClick={createBooking} className="btn-primary w-full py-4 text-base font-bold shadow-xl shadow-primary/30 flex items-center justify-center gap-2">
                          {editingBookingId ? "Actualizar Reserva" : "Confirmar Agenda"}
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showDayDetailsModal && selectedDayForDetails && (
              <div className="modal-overlay fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, y: "20%", scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: "20%", scale: 0.98 }}
                  transition={{ 
                    duration: 0.4, 
                    ease: [0.22, 1, 0.36, 1]
                  }}
                  className="card w-full max-w-md p-0 overflow-hidden shadow-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] pb-8 sm:pb-0"
                >
                  <div className="w-12 h-1.5 bg-slate-200/20 rounded-full mx-auto my-4 sm:hidden absolute top-4 left-1/2 -translate-x-1/2 z-10" />
                  <div className="bg-primary p-6 text-white flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-black">Detalle de Agendas</h3>
                      <p className="text-xs font-bold opacity-80 uppercase tracking-widest mt-1">
                        {format(selectedDayForDetails, "EEEE d 'de' MMMM", { locale: es })}
                      </p>
                      {activeModule === "agenda_camion" && (
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70 mt-2">
                          {calendarTruckFilterId
                            ? trucks.find((truck) => truck.id === calendarTruckFilterId)?.name
                            : "Todas las unidades"}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setShowDayDetailsModal(false)} className="p-2 hover:bg-white/10 rounded-xl">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  
                  <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar bg-slate-50">
                    <div className="space-y-4">
                      {dayDetailBookings.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 font-bold text-sm">No hay agendas programadas</div>
                      ) : (
                        dayDetailBookings.map((b) => (
                          <div key={b.id} className={`bg-white p-4 rounded-2xl border shadow-sm ${b.isSap ? 'border-amber-100 bg-amber-50/30' : 'border-slate-100'}`}>
                            <div className="flex items-center gap-4">
                              <div className={`w-1.5 h-10 rounded-full ${
                                b.status === 'completed'
                                  ? 'bg-success'
                                  : b.status === 'in_progress'
                                    ? 'bg-primary'
                                    : 'bg-warning'
                              }`} />
                              <div className="flex-1">
                                <div className="flex justify-between items-center gap-4">
                                  <span className="font-extrabold text-sm">
                                    {b.isSap ? `SAP PO #${b.docNum}` : trucks.find((truck) => truck.id === b.truckId)?.name || 'Camión'}
                                  </span>
                                  <span className="text-[10px] font-black text-slate-400">
                                    {b.isSap ? 'DocDueDate' : `${b.startTime} - ${b.endTime}`}
                                  </span>
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                  {b.isSap ? poTitle(b.user) : `Ref: ${b.user}`}
                                </div>
                                {b.isSap && (
                                  <div className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.18em] ${
                                    b.materialType === "carga_pesada"
                                      ? "bg-rose-100 text-rose-700"
                                      : b.materialType === "carga_estandar"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-emerald-100 text-emerald-700"
                                  }`}>
                                    {b.materialType === "carga_pesada"
                                      ? "Carga pesada"
                                      : b.materialType === "carga_estandar"
                                        ? "Carga estandar"
                                        : "Carga ligera"}
                                  </div>
                                )}
                              </div>
                              {b.isSap && (
                                <Database className="w-4 h-4 text-amber-500 ml-auto" />
                              )}
                            </div>

                            {!b.isSap && activeModule === "agenda_camion" && (
                              <div className="mt-4 flex items-center justify-end gap-2">
                                {role === "agendador" && b.status !== "completed" && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setShowDayDetailsModal(false);
                                        openEditModal(b);
                                      }}
                                      className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 hover:text-primary hover:border-primary/20"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowDayDetailsModal(false);
                                        deleteBooking(b.id);
                                      }}
                                      className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-500"
                                    >
                                      Eliminar
                                    </button>
                                  </>
                                )}
                                {role === "chofer" && b.status === "pending" && (
                                  <button
                                    onClick={() => updateStatus(b.id, "in_progress")}
                                    className="rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white"
                                  >
                                    Iniciar
                                  </button>
                                )}
                                {role === "chofer" && b.status === "in_progress" && (
                                  <button
                                    onClick={() => updateStatus(b.id, "completed")}
                                    className="rounded-xl bg-success px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white"
                                  >
                                    Finalizar
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-white">
                    <div className="flex gap-3">
                      {role === "agendador" && activeModule === "agenda_camion" && (
                        <button
                          onClick={() => {
                            setSelectedDate(selectedDayForDetails);
                            setShowDayDetailsModal(false);
                            setShowBookingModal(true);
                          }}
                          className="btn-primary flex-1 py-4 text-xs font-black uppercase tracking-[0.2em]"
                        >
                          Nueva agenda
                        </button>
                      )}
                      <button onClick={() => setShowDayDetailsModal(false)} className="flex-1 py-4 text-xs font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors">Cerrar Ventana</button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Confirmation Modal - Always at the Root for Accessibility during Login Errors */}
      <AnimatePresence>
        {showConfirmModal && confirmConfig && (
          <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.22, 1, 0.36, 1]
              }}
              className="card w-full max-w-sm p-8 shadow-3xl text-center relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-1.5 ${confirmConfig.type === 'danger' ? 'bg-red-500' : 'bg-primary'}`} />
              
              <div className={`mx-auto w-16 h-16 rounded-3xl flex items-center justify-center mb-6 ${confirmConfig.type === 'danger' ? 'bg-red-50 text-red-500' : 'bg-primary/10 text-primary'}`}>
                {confirmConfig.type === 'danger' ? <AlertTriangle className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
              </div>
              
              <h3 className="text-2xl font-black tracking-tight mb-3">{confirmConfig.title}</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">{confirmConfig.message}</p>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => { confirmConfig.onConfirm(); setShowConfirmModal(false); }}
                  className={`py-4 rounded-2xl font-extrabold text-sm uppercase tracking-widest shadow-xl transition-all active:scale-95 ${
                    confirmConfig.type === 'danger' ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-primary text-white shadow-primary/20'
                  }`}
                >
                  {confirmConfig.confirmLabel || 'Entendido'}
                </button>
                {confirmConfig.showCancel !== false && (
                  <button onClick={() => setShowConfirmModal(false)} className="py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">
                    Cancelar
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
