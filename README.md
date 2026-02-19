# SG-SST Monorepo

Estructura base inicial para un proyecto SaaS SG-SST con backend en NestJS y frontend en React + Vite.

## Estructura

- `backend/`: API con NestJS (TypeScript)
- `frontend/`: aplicación web con React + Vite (TypeScript)

## Instalación de dependencias

Instala dependencias por proyecto:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Correr backend (NestJS)

```bash
cd backend
npm run start:dev
```

El servidor por defecto inicia en `http://localhost:3000`.

## Correr frontend (React + Vite)

```bash
cd frontend
npm run dev
```

Vite mostrará la URL local (normalmente `http://localhost:5173`).
