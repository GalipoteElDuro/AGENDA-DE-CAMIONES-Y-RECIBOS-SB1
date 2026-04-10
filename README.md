# Agenda de Camiones y Recibos

Aplicación de gestión de agendas para camiones y recibos, diseñada para entornos logísticos con integración a SAP Business One (Service Layer).

## Descripción General

Esta aplicación permite a los usuarios logísticos (agendadores y choferes) gestionar la agenda de camiones y recibos de forma visual e intuitiva. Ofrece una interfaz moderna con soporte para vistas de calendario mensual y agenda diaria, actualización de estados en tiempo real mediante WebSockets, y un sistema de autenticación simulado contra SAP B1.

## Tecnologías Utilizadas

- **Frontend:** React 19, TypeScript, TailwindCSS 4, Framer Motion, Lucide React, date-fns
- **Backend:** Express.js, Socket.IO
- **Build Tool:** Vite 6, tsx (TypeScript execution)

## Funcionalidades

- **Autenticación simulada con SAP B1** — Login a través de Service Layer (modo demo con respuesta simulada)
- **Dos roles de usuario:**
  - **Agendador:** Puede crear, editar y eliminar agendas de camiones/recibos.
  - **Chofer:** Puede iniciar y finalizar agendas (cambiar estado: Pendiente → En Proceso → Completado).
- **Dos módulos de agenda:**
  - **Agenda de Camiones:** Vista de calendario mensual + agenda diaria por camión con selección de vehículo.
  - **Agenda de Recibo:** Matriz mensual con conteo visual de agendas pendientes por día.
- **Reservas en tiempo real** mediante Socket.IO (sincronización instantánea entre clientes).
- **Detección de conflictos de horario** — Impide que un mismo camión tenga dos agendas simultáneas en la misma fecha.
- **Modales interactivos** — Para crear/editar agendas, ver detalles del día y confirmaciones.
- **Diseño responsive** — Optimizado para escritorio y dispositivos móviles con navegación inferior.

## Requisitos Previos

- Node.js (v18 o superior)
- npm

## Instalación

```bash
npm install
```

## Ejecución (Desarrollo)

```bash
npm run dev
```

El servidor se inicia en `http://localhost:3000`.

## Build de Producción

```bash
npm run build
```

Los archivos estáticos se generan en la carpeta `dist/`.

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo con Vite + Express |
| `npm run build` | Compila el frontend para producción |
| `npm run preview` | Previsualiza el build de producción |
| `npm run start` | Inicia el servidor en modo producción |
| `npm run lint` | Verificación de tipos con TypeScript |

## Estructura del Proyecto

```
├── server.ts           # Servidor Express + Socket.IO + Vite middleware
├── src/
│   ├── App.tsx         # Componente principal de la aplicación
│   ├── index.css       # Estilos globales + configuración de TailwindCSS
│   └── main.tsx        # Punto de entrada de React
├── index.html          # Plantilla HTML
├── vite.config.ts      # Configuración de Vite
├── tsconfig.json       # Configuración de TypeScript
└── package.json
```

## Variables de Entorno

Copia el archivo `.env.example` y configura las variables necesarias:

```bash
GEMINI_API_KEY=tu-api-key
APP_URL=http://localhost:3000
```

## Arquitectura

- **Servidor Express** en el puerto 3000 que sirve tanto la API como el frontend.
- **Socket.IO** para comunicación en tiempo real entre todos los clientes conectados.
- **Estado en memoria** (sin base de datos) — las agendas se pierden al reiniciar el servidor.
- **Vite en modo middleware** durante desarrollo para HMR y compilación bajo demanda.
- **Archivos estáticos** en producción desde la carpeta `dist/`.
