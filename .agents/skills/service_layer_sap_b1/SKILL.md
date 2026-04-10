---
name: sap-b1-service-layer
description: Guía completa de buenas prácticas para el Service Layer de SAP Business One HANA. Cubre autenticación, operaciones CRUD, manejo de errores, optimización, seguridad y patrones de diseño recomendados para APIs REST del Service Layer.
---

# SAP Business One HANA Service Layer - Buenas Prácticas

Esta skill proporciona orientación experta sobre el uso correcto del Service Layer de SAP Business One HANA, incluyendo patrones de diseño, mejores prácticas y ejemplos de código optimizados.

## Tabla de Contenidos

1. [Fundamentos del Service Layer](#fundamentos)
2. [Autenticación y Gestión de Sesiones](#autenticación)
3. [Operaciones CRUD](#operaciones-crud)
4. [Consultas y Filtros Avanzados](#consultas-avanzadas)
5. [Manejo de Errores](#manejo-errores)
6. [Optimización y Rendimiento](#optimización)
7. [Seguridad](#seguridad)
8. [Patrones de Diseño Recomendados](#patrones)
9. [Ejemplos Completos](#ejemplos)

---

## Fundamentos del Service Layer {#fundamentos}

### ¿Qué es el Service Layer?

El Service Layer es una API RESTful que proporciona acceso programático a SAP Business One a través de HTTP/HTTPS. Permite realizar operaciones CRUD sobre entidades de negocio sin necesidad de DI API o SDK.

### Arquitectura Base

```
Cliente (JavaScript, Python, etc.)
    ↓
HTTPS Request
    ↓
Service Layer (Puerto 50000/50001)
    ↓
SAP Business One HANA Database
```

### URL Base

```
https://<servidor>:50000/b1s/v1/
```

**IMPORTANTE**: Siempre usar HTTPS (puerto 50000) en producción, nunca HTTP (puerto 50001).

---

## Autenticación y Gestión de Sesiones {#autenticación}

### BUENA PRÁCTICA #1: Login Centralizado

**❌ MAL:**
```javascript
// No crear nuevas sesiones en cada request
function getBusinessPartner(cardCode) {
    const session = await login(); // LOGIN EN CADA LLAMADA
    const bp = await fetch(`/BusinessPartners('${cardCode}')`);
    await logout();
    return bp;
}
```

**✅ BIEN:**
```javascript
// Reutilizar sesión durante su vida útil
class ServiceLayerClient {
    constructor(baseUrl, companyDB) {
        this.baseUrl = baseUrl;
        this.companyDB = companyDB;
        this.sessionId = null;
        this.sessionTimeout = null;
    }

    async login(username, password) {
        const response = await fetch(`${this.baseUrl}/Login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                CompanyDB: this.companyDB,
                UserName: username,
                Password: password
            })
        });

        if (!response.ok) {
            throw new Error(`Login failed: ${response.status}`);
        }

        const data = await response.json();
        this.sessionId = data.SessionId;
        
        // Configurar auto-refresh antes del timeout
        this.scheduleSessionRefresh(data.SessionTimeout);
        
        return this.sessionId;
    }

    scheduleSessionRefresh(timeout) {
        // Refrescar 2 minutos antes del timeout
        const refreshTime = (timeout - 2) * 60 * 1000;
        
        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
        }

        this.sessionTimeout = setTimeout(async () => {
            await this.ping();
        }, refreshTime);
    }

    async ping() {
        // Mantener sesión activa
        await this.request('GET', '$ping');
        return true;
    }

    async request(method, endpoint, body = null) {
        if (!this.sessionId) {
            throw new Error('No active session. Please login first.');
        }

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `B1SESSION=${this.sessionId}`
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}/${endpoint}`, options);
        
        if (response.status === 401) {
            // Sesión expirada, re-autenticar
            throw new Error('Session expired');
        }

        return response;
    }

    async logout() {
        if (!this.sessionId) return;

        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
        }

        await fetch(`${this.baseUrl}/Logout`, {
            method: 'POST',
            headers: { 'Cookie': `B1SESSION=${this.sessionId}` }
        });

        this.sessionId = null;
    }
}
```

### BUENA PRÁCTICA #2: Manejo de Cookies

**✅ CORRECTO:**
```javascript
// Opción 1: Usar Cookie header
headers: {
    'Cookie': `B1SESSION=${sessionId}; ROUTEID=.node1`
}

// Opción 2: Usar Set-Cookie automático (en browsers)
// El navegador maneja automáticamente las cookies
```

---

## Operaciones CRUD {#operaciones-crud}

### CREATE (POST)

**BUENA PRÁCTICA #3: Validación Antes de Enviar**

**❌ MAL:**
```javascript
// Enviar datos sin validar
async function createBusinessPartner(data) {
    return await serviceLayer.request('POST', 'BusinessPartners', data);
}
```

**✅ BIEN:**
```javascript
async function createBusinessPartner(data) {
    // Validar campos requeridos
    const required = ['CardCode', 'CardName', 'CardType'];
    const missing = required.filter(field => !data[field]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validar formato de CardCode
    if (!/^[A-Z0-9_-]+$/.test(data.CardCode)) {
        throw new Error('CardCode must contain only alphanumeric, dash, and underscore');
    }

    // Validar CardType
    if (!['cCustomer', 'cSupplier', 'cLid'].includes(data.CardType)) {
        throw new Error('Invalid CardType');
    }

    try {
        const response = await serviceLayer.request('POST', 'BusinessPartners', data);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error.message.value);
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating Business Partner:', error);
        throw error;
    }
}
```

### READ (GET)

**BUENA PRÁCTICA #4: Seleccionar Solo Campos Necesarios**

**❌ MAL:**
```javascript
// Traer todos los campos (pesado e ineficiente)
const bp = await serviceLayer.request('GET', 
    `BusinessPartners('C00001')`
);
```

**✅ BIEN:**
```javascript
// Seleccionar solo campos necesarios
const bp = await serviceLayer.request('GET', 
    `BusinessPartners('C00001')?$select=CardCode,CardName,EmailAddress,Phone1`
);

// Mejor aún: Usar función helper
async function getBusinessPartner(cardCode, fields = []) {
    const selectClause = fields.length > 0 
        ? `?$select=${fields.join(',')}` 
        : '';
    
    const response = await serviceLayer.request('GET', 
        `BusinessPartners('${cardCode}')${selectClause}`
    );
    
    return await response.json();
}

// Uso
const bp = await getBusinessPartner('C00001', [
    'CardCode', 'CardName', 'EmailAddress', 'Phone1'
]);
```

**BUENA PRÁCTICA #5: Paginación en Listas Grandes**

**❌ MAL:**
```javascript
// Traer todos los registros de una vez (puede causar timeout)
const allBPs = await serviceLayer.request('GET', 'BusinessPartners');
```

**✅ BIEN:**
```javascript
async function* getAllBusinessPartners(pageSize = 100) {
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
        const response = await serviceLayer.request('GET',
            `BusinessPartners?$skip=${skip}&$top=${pageSize}&$select=CardCode,CardName`
        );

        const data = await response.json();
        
        if (data.value && data.value.length > 0) {
            yield data.value;
            skip += pageSize;
            hasMore = data.value.length === pageSize;
        } else {
            hasMore = false;
        }
    }
}

// Uso con async iterator
for await (const batchOfBPs of getAllBusinessPartners(100)) {
    console.log(`Processing batch of ${batchOfBPs.length} BPs`);
    // Procesar cada lote
}
```

### UPDATE (PATCH)

**BUENA PRÁCTICA #6: Usar PATCH, No PUT**

**❌ MAL:**
```javascript
// PUT requiere enviar TODOS los campos
await serviceLayer.request('PUT', 
    `BusinessPartners('C00001')`,
    fullBusinessPartnerObject // Todos los campos
);
```

**✅ BIEN:**
```javascript
// PATCH solo requiere campos a modificar
async function updateBusinessPartner(cardCode, updates) {
    const response = await serviceLayer.request('PATCH',
        `BusinessPartners('${cardCode}')`,
        updates // Solo campos a actualizar
    );

    if (response.status === 204) {
        return { success: true, message: 'Updated successfully' };
    }

    throw new Error('Update failed');
}

// Uso
await updateBusinessPartner('C00001', {
    EmailAddress: 'nuevo@email.com',
    Phone1: '555-1234'
});
```

**BUENA PRÁCTICA #7: Actualización de Líneas Hijas**

**✅ CORRECTO:**
```javascript
async function updateOrderLines(docEntry, lines) {
    // Para actualizar líneas, enviar array completo
    // Las líneas sin LineNum se agregan
    // Las líneas con LineNum se actualizan
    // Las líneas omitidas se mantienen sin cambios
    
    const response = await serviceLayer.request('PATCH',
        `Orders(${docEntry})`,
        {
            DocumentLines: lines.map((line, index) => ({
                LineNum: line.LineNum !== undefined ? line.LineNum : null,
                ItemCode: line.ItemCode,
                Quantity: line.Quantity,
                Price: line.Price
                // Otros campos según necesidad
            }))
        }
    );

    return response.status === 204;
}
```

### DELETE

**BUENA PRÁCTICA #8: Confirmar Antes de Eliminar**

**✅ BIEN:**
```javascript
async function deleteBusinessPartner(cardCode, confirmCallback) {
    // Verificar que existe
    const exists = await checkExists('BusinessPartners', cardCode);
    if (!exists) {
        throw new Error(`Business Partner ${cardCode} not found`);
    }

    // Verificar dependencias (documentos abiertos, etc.)
    const hasOpenDocs = await checkOpenDocuments(cardCode);
    if (hasOpenDocs) {
        throw new Error('Cannot delete: BP has open documents');
    }

    // Solicitar confirmación
    const confirmed = await confirmCallback(
        `Are you sure you want to delete Business Partner ${cardCode}?`
    );

    if (!confirmed) {
        return { success: false, message: 'Cancelled by user' };
    }

    const response = await serviceLayer.request('DELETE',
        `BusinessPartners('${cardCode}')`
    );

    return {
        success: response.status === 204,
        message: 'Business Partner deleted successfully'
    };
}
```

---

## Consultas y Filtros Avanzados {#consultas-avanzadas}

### BUENA PRÁCTICA #9: Filtros Eficientes

**❌ MAL:**
```javascript
// Traer todo y filtrar en cliente
const allBPs = await serviceLayer.request('GET', 'BusinessPartners');
const customers = allBPs.value.filter(bp => bp.CardType === 'cCustomer');
```

**✅ BIEN:**
```javascript
// Filtrar en servidor con $filter
const response = await serviceLayer.request('GET',
    `BusinessPartners?$filter=CardType eq 'cCustomer' and Valid eq 'tYES'&$select=CardCode,CardName`
);
const customers = await response.json();
```

### Operadores de Filtro Comunes

```javascript
// Igualdad
$filter=CardCode eq 'C00001'

// Desigualdad
$filter=CardCode ne 'C00001'

// Mayor que / Menor que
$filter=DocTotal gt 1000 and DocTotal lt 5000

// Contiene (substringof)
$filter=substringof('ACME', CardName)

// Starts with (startswith)
$filter=startswith(CardName, 'A')

// Ends with (endswith)
$filter=endswith(CardCode, '001')

// AND / OR
$filter=CardType eq 'cCustomer' and GroupCode eq 100
$filter=CardType eq 'cCustomer' or CardType eq 'cLid'

// IN (uso de 'or' múltiple)
$filter=CardCode eq 'C001' or CardCode eq 'C002' or CardCode eq 'C003'

// Fechas
$filter=DocDate ge '2024-01-01' and DocDate le '2024-12-31'
```

### BUENA PRÁCTICA #10: OrderBy para Resultados Consistentes

**✅ BIEN:**
```javascript
// Ordenar resultados
const response = await serviceLayer.request('GET',
    `Orders?$orderby=DocEntry desc&$top=10`
);

// Múltiples criterios
const response = await serviceLayer.request('GET',
    `BusinessPartners?$orderby=GroupCode asc, CardName asc`
);
```

### BUENA PRÁCTICA #11: Expand para Datos Relacionados

**❌ MAL:**
```javascript
// Múltiples requests
const order = await getOrder(123);
for (const line of order.DocumentLines) {
    const item = await getItem(line.ItemCode); // N+1 queries
    console.log(item.ItemName);
}
```

**✅ BIEN:**
```javascript
// Una sola query con expand
const response = await serviceLayer.request('GET',
    `Orders(123)?$select=DocEntry,DocNum,CardCode&$expand=DocumentLines($select=ItemCode,Quantity,Price)`
);
const order = await response.json();

// Acceder a líneas directamente
order.DocumentLines.forEach(line => {
    console.log(line.ItemCode, line.Quantity);
});
```

---

## Manejo de Errores {#manejo-errores}

### BUENA PRÁCTICA #12: Estructura de Manejo de Errores

**✅ BIEN:**
```javascript
class ServiceLayerError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = 'ServiceLayerError';
        this.code = code;
        this.details = details;
    }
}

async function safeRequest(method, endpoint, body = null) {
    try {
        const response = await serviceLayer.request(method, endpoint, body);

        // Manejar diferentes códigos de estado
        if (response.ok) {
            // 200-299: Success
            if (response.status === 204) {
                return { success: true };
            }
            return await response.json();
        }

        // Manejar errores HTTP
        const errorData = await response.json();
        
        switch (response.status) {
            case 400:
                throw new ServiceLayerError(
                    'BAD_REQUEST',
                    'Invalid request data',
                    errorData.error
                );
            
            case 401:
                throw new ServiceLayerError(
                    'UNAUTHORIZED',
                    'Session expired or invalid credentials',
                    errorData.error
                );
            
            case 404:
                throw new ServiceLayerError(
                    'NOT_FOUND',
                    'Resource not found',
                    errorData.error
                );
            
            case 409:
                throw new ServiceLayerError(
                    'CONFLICT',
                    'Resource already exists or conflict',
                    errorData.error
                );
            
            case 500:
                throw new ServiceLayerError(
                    'SERVER_ERROR',
                    'Internal server error',
                    errorData.error
                );
            
            default:
                throw new ServiceLayerError(
                    'UNKNOWN_ERROR',
                    `Unexpected status: ${response.status}`,
                    errorData.error
                );
        }

    } catch (error) {
        if (error instanceof ServiceLayerError) {
            throw error;
        }

        // Errores de red u otros
        throw new ServiceLayerError(
            'NETWORK_ERROR',
            'Network request failed',
            error.message
        );
    }
}

// Uso con try-catch
try {
    const bp = await safeRequest('GET', `BusinessPartners('C00001')`);
    console.log('Success:', bp);
} catch (error) {
    if (error instanceof ServiceLayerError) {
        console.error(`Error [${error.code}]:`, error.message);
        if (error.details) {
            console.error('Details:', error.details);
        }
    } else {
        console.error('Unexpected error:', error);
    }
}
```

### BUENA PRÁCTICA #13: Retry Logic para Errores Transitorios

**✅ BIEN:**
```javascript
async function requestWithRetry(
    method, 
    endpoint, 
    body = null, 
    maxRetries = 3,
    retryDelay = 1000
) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await safeRequest(method, endpoint, body);
        } catch (error) {
            const isLastAttempt = attempt === maxRetries;
            const isRetryable = [
                'NETWORK_ERROR',
                'SERVER_ERROR'
            ].includes(error.code);

            if (isRetryable && !isLastAttempt) {
                console.warn(
                    `Attempt ${attempt} failed: ${error.message}. ` +
                    `Retrying in ${retryDelay}ms...`
                );
                await sleep(retryDelay * attempt); // Exponential backoff
                continue;
            }

            throw error;
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Optimización y Rendimiento {#optimización}

### BUENA PRÁCTICA #14: Batch Requests

**❌ MAL:**
```javascript
// Múltiples requests secuenciales
for (const item of items) {
    await createItem(item); // Lento
}
```

**✅ BIEN:**
```javascript
// Usar $batch para múltiples operaciones
async function batchCreate(entitySet, items) {
    const batchId = `batch_${Date.now()}`;
    const changesetId = `changeset_${Date.now()}`;

    let batchBody = `--${batchId}\r\n`;
    batchBody += `Content-Type: multipart/mixed; boundary=${changesetId}\r\n\r\n`;

    items.forEach((item, index) => {
        batchBody += `--${changesetId}\r\n`;
        batchBody += `Content-Type: application/http\r\n`;
        batchBody += `Content-Transfer-Encoding: binary\r\n\r\n`;
        batchBody += `POST ${entitySet} HTTP/1.1\r\n`;
        batchBody += `Content-Type: application/json\r\n\r\n`;
        batchBody += `${JSON.stringify(item)}\r\n`;
    });

    batchBody += `--${changesetId}--\r\n`;
    batchBody += `--${batchId}--\r\n`;

    const response = await fetch(`${baseUrl}/$batch`, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/mixed; boundary=${batchId}`,
            'Cookie': `B1SESSION=${sessionId}`
        },
        body: batchBody
    });

    return await parseBatchResponse(response);
}

// Nota: El batch debe usarse con precaución y solo cuando sea necesario
// Para operaciones críticas, requests individuales con manejo de errores
// pueden ser más apropiados
```

### BUENA PRÁCTICA #15: Caché de Datos Maestros

**✅ BIEN:**
```javascript
class MasterDataCache {
    constructor(serviceLayer, ttl = 3600000) { // 1 hora por defecto
        this.serviceLayer = serviceLayer;
        this.ttl = ttl;
        this.cache = new Map();
    }

    async get(entitySet, key, fields = []) {
        const cacheKey = `${entitySet}:${key}:${fields.join(',')}`;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.ttl) {
            return cached.data;
        }

        // Fetch from service layer
        const selectClause = fields.length > 0 
            ? `?$select=${fields.join(',')}` 
            : '';
        
        const response = await this.serviceLayer.request('GET',
            `${entitySet}('${key}')${selectClause}`
        );

        const data = await response.json();

        this.cache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        return data;
    }

    invalidate(entitySet, key = null) {
        if (key) {
            // Invalidar clave específica
            const prefix = `${entitySet}:${key}:`;
            for (const cacheKey of this.cache.keys()) {
                if (cacheKey.startsWith(prefix)) {
                    this.cache.delete(cacheKey);
                }
            }
        } else {
            // Invalidar todo el entity set
            const prefix = `${entitySet}:`;
            for (const cacheKey of this.cache.keys()) {
                if (cacheKey.startsWith(prefix)) {
                    this.cache.delete(cacheKey);
                }
            }
        }
    }

    clear() {
        this.cache.clear();
    }
}

// Uso
const cache = new MasterDataCache(serviceLayer);

// Primera llamada: fetch desde Service Layer
const item = await cache.get('Items', 'A00001', ['ItemCode', 'ItemName', 'Price']);

// Llamadas subsecuentes: desde caché
const sameItem = await cache.get('Items', 'A00001', ['ItemCode', 'ItemName', 'Price']);

// Invalidar al actualizar
await updateItem('A00001', { Price: 100 });
cache.invalidate('Items', 'A00001');
```

### BUENA PRÁCTICA #16: Compresión de Respuestas

**✅ BIEN:**
```javascript
// Solicitar respuestas comprimidas
const response = await fetch(url, {
    headers: {
        'Accept-Encoding': 'gzip, deflate',
        'Cookie': `B1SESSION=${sessionId}`
    }
});

// El Service Layer automáticamente comprimirá la respuesta
// Esto es especialmente útil para queries grandes
```

---

## Seguridad {#seguridad}

### BUENA PRÁCTICA #17: Nunca Exponer Credenciales

**❌ MAL:**
```javascript
// NUNCA hardcodear credenciales
const username = 'manager';
const password = 'Password123';
```

**✅ BIEN:**
```javascript
// Usar variables de entorno
const username = process.env.SAP_USERNAME;
const password = process.env.SAP_PASSWORD;
const companyDB = process.env.SAP_COMPANY_DB;

// O sistema de secretos
const credentials = await secretsManager.getSecret('sap-credentials');
```

### BUENA PRÁCTICA #18: Sanitizar Inputs

**✅ BIEN:**
```javascript
function sanitizeInput(input, type = 'string') {
    if (input === null || input === undefined) {
        return null;
    }

    switch (type) {
        case 'string':
            // Remover caracteres peligrosos para SQL injection
            return String(input)
                .replace(/['";\\]/g, '')
                .trim()
                .substring(0, 254); // Limitar longitud

        case 'number':
            const num = Number(input);
            return isNaN(num) ? null : num;

        case 'date':
            const date = new Date(input);
            return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];

        case 'alphanumeric':
            return String(input)
                .replace(/[^A-Za-z0-9_-]/g, '')
                .trim();

        default:
            return null;
    }
}

// Uso
async function createBusinessPartner(rawData) {
    const sanitized = {
        CardCode: sanitizeInput(rawData.CardCode, 'alphanumeric'),
        CardName: sanitizeInput(rawData.CardName, 'string'),
        Phone1: sanitizeInput(rawData.Phone1, 'string'),
        EmailAddress: sanitizeInput(rawData.EmailAddress, 'string')
    };

    // Validación adicional
    if (!sanitized.CardCode || !sanitized.CardName) {
        throw new Error('Required fields missing after sanitization');
    }

    return await serviceLayer.request('POST', 'BusinessPartners', sanitized);
}
```

### BUENA PRÁCTICA #19: HTTPS Obligatorio

**✅ BIEN:**
```javascript
class SecureServiceLayer {
    constructor(config) {
        // Validar que sea HTTPS
        if (!config.baseUrl.startsWith('https://')) {
            throw new Error(
                'Security Error: Only HTTPS connections are allowed. ' +
                'Use port 50000 instead of 50001.'
            );
        }

        this.baseUrl = config.baseUrl;
        this.companyDB = config.companyDB;
    }
}
```

### BUENA PRÁCTICA #20: Timeout y Rate Limiting

**✅ BIEN:**
```javascript
class RateLimitedServiceLayer {
    constructor(serviceLayer, maxRequestsPerSecond = 10) {
        this.serviceLayer = serviceLayer;
        this.maxRequestsPerSecond = maxRequestsPerSecond;
        this.requestQueue = [];
        this.processing = false;
    }

    async request(method, endpoint, body = null, timeout = 30000) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                method,
                endpoint,
                body,
                timeout,
                resolve,
                reject
            });

            if (!this.processing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        this.processing = true;
        const delayBetweenRequests = 1000 / this.maxRequestsPerSecond;

        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    request.timeout
                );

                const response = await this.serviceLayer.request(
                    request.method,
                    request.endpoint,
                    request.body,
                    { signal: controller.signal }
                );

                clearTimeout(timeoutId);
                request.resolve(response);

            } catch (error) {
                if (error.name === 'AbortError') {
                    request.reject(new Error(
                        `Request timeout after ${request.timeout}ms`
                    ));
                } else {
                    request.reject(error);
                }
            }

            // Esperar antes del siguiente request
            if (this.requestQueue.length > 0) {
                await sleep(delayBetweenRequests);
            }
        }

        this.processing = false;
    }
}
```

---

## Patrones de Diseño Recomendados {#patrones}

### PATRÓN #1: Repository Pattern

**✅ BIEN:**
```javascript
class BusinessPartnerRepository {
    constructor(serviceLayer) {
        this.serviceLayer = serviceLayer;
        this.entitySet = 'BusinessPartners';
    }

    async findById(cardCode, fields = []) {
        const selectClause = fields.length > 0 
            ? `?$select=${fields.join(',')}` 
            : '';

        const response = await this.serviceLayer.request('GET',
            `${this.entitySet}('${cardCode}')${selectClause}`
        );

        return await response.json();
    }

    async findAll(filters = {}, options = {}) {
        let query = this.entitySet;
        const params = [];

        if (filters.cardType) {
            params.push(`$filter=CardType eq '${filters.cardType}'`);
        }

        if (filters.groupCode) {
            params.push(`$filter=GroupCode eq ${filters.groupCode}`);
        }

        if (options.select) {
            params.push(`$select=${options.select.join(',')}`);
        }

        if (options.orderBy) {
            params.push(`$orderby=${options.orderBy}`);
        }

        if (options.top) {
            params.push(`$top=${options.top}`);
        }

        if (options.skip) {
            params.push(`$skip=${options.skip}`);
        }

        if (params.length > 0) {
            query += '?' + params.join('&');
        }

        const response = await this.serviceLayer.request('GET', query);
        const data = await response.json();
        return data.value || [];
    }

    async create(data) {
        const response = await this.serviceLayer.request('POST',
            this.entitySet,
            data
        );

        return await response.json();
    }

    async update(cardCode, data) {
        const response = await this.serviceLayer.request('PATCH',
            `${this.entitySet}('${cardCode}')`,
            data
        );

        return response.status === 204;
    }

    async delete(cardCode) {
        const response = await this.serviceLayer.request('DELETE',
            `${this.entitySet}('${cardCode}')`
        );

        return response.status === 204;
    }

    async exists(cardCode) {
        try {
            await this.findById(cardCode, ['CardCode']);
            return true;
        } catch (error) {
            if (error.code === 'NOT_FOUND') {
                return false;
            }
            throw error;
        }
    }
}

// Uso
const bpRepo = new BusinessPartnerRepository(serviceLayer);

// Buscar por ID
const bp = await bpRepo.findById('C00001', ['CardCode', 'CardName']);

// Buscar con filtros
const customers = await bpRepo.findAll(
    { cardType: 'cCustomer' },
    { 
        select: ['CardCode', 'CardName', 'EmailAddress'],
        orderBy: 'CardName asc',
        top: 50
    }
);

// Crear
const newBP = await bpRepo.create({
    CardCode: 'C99999',
    CardName: 'New Customer',
    CardType: 'cCustomer'
});

// Actualizar
await bpRepo.update('C99999', {
    Phone1: '555-1234'
});

// Verificar existencia
const exists = await bpRepo.exists('C99999');
```

### PATRÓN #2: Unit of Work para Transacciones

**✅ BIEN:**
```javascript
class UnitOfWork {
    constructor(serviceLayer) {
        this.serviceLayer = serviceLayer;
        this.operations = [];
    }

    addCreate(entitySet, data) {
        this.operations.push({
            type: 'CREATE',
            entitySet,
            data
        });
    }

    addUpdate(entitySet, key, data) {
        this.operations.push({
            type: 'UPDATE',
            entitySet,
            key,
            data
        });
    }

    addDelete(entitySet, key) {
        this.operations.push({
            type: 'DELETE',
            entitySet,
            key
        });
    }

    async commit() {
        const results = [];
        const rollbackOps = [];

        try {
            for (const op of this.operations) {
                let result;

                switch (op.type) {
                    case 'CREATE':
                        result = await this.serviceLayer.request('POST',
                            op.entitySet,
                            op.data
                        );
                        const created = await result.json();
                        
                        // Guardar operación de rollback
                        rollbackOps.push({
                            type: 'DELETE',
                            entitySet: op.entitySet,
                            key: this.extractKey(created, op.entitySet)
                        });
                        
                        results.push(created);
                        break;

                    case 'UPDATE':
                        result = await this.serviceLayer.request('PATCH',
                            `${op.entitySet}('${op.key}')`,
                            op.data
                        );
                        results.push({ success: true, key: op.key });
                        break;

                    case 'DELETE':
                        result = await this.serviceLayer.request('DELETE',
                            `${op.entitySet}('${op.key}')`
                        );
                        results.push({ success: true, key: op.key });
                        break;
                }
            }

            this.operations = [];
            return { success: true, results };

        } catch (error) {
            // Rollback: deshacer operaciones en orden inverso
            console.error('Transaction failed, rolling back...', error);
            
            for (const rollback of rollbackOps.reverse()) {
                try {
                    await this.serviceLayer.request(
                        'DELETE',
                        `${rollback.entitySet}('${rollback.key}')`
                    );
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
            }

            this.operations = [];
            throw error;
        }
    }

    extractKey(entity, entitySet) {
        // Extraer la clave primaria según el entity set
        const keyMap = {
            'BusinessPartners': 'CardCode',
            'Items': 'ItemCode',
            'Orders': 'DocEntry',
            'Invoices': 'DocEntry'
        };

        return entity[keyMap[entitySet]] || entity.DocEntry || entity.Code;
    }

    clear() {
        this.operations = [];
    }
}

// Uso
const uow = new UnitOfWork(serviceLayer);

uow.addCreate('BusinessPartners', {
    CardCode: 'C99998',
    CardName: 'Test Customer',
    CardType: 'cCustomer'
});

uow.addCreate('ContactEmployees', {
    CardCode: 'C99998',
    Name: 'John Doe',
    Position: 'Manager'
});

try {
    const result = await uow.commit();
    console.log('Transaction committed:', result);
} catch (error) {
    console.error('Transaction rolled back:', error);
}
```

### PATRÓN #3: Query Builder

**✅ BIEN:**
```javascript
class QueryBuilder {
    constructor(entitySet) {
        this.entitySet = entitySet;
        this.filters = [];
        this.selectFields = [];
        this.orderByFields = [];
        this.expandFields = [];
        this.topValue = null;
        this.skipValue = null;
    }

    select(...fields) {
        this.selectFields.push(...fields);
        return this;
    }

    filter(condition) {
        this.filters.push(condition);
        return this;
    }

    where(field, operator, value) {
        let condition;
        
        if (typeof value === 'string') {
            condition = `${field} ${operator} '${value}'`;
        } else {
            condition = `${field} ${operator} ${value}`;
        }

        this.filters.push(condition);
        return this;
    }

    whereIn(field, values) {
        const conditions = values.map(v => 
            typeof v === 'string' 
                ? `${field} eq '${v}'` 
                : `${field} eq ${v}`
        );
        this.filters.push(`(${conditions.join(' or ')})`);
        return this;
    }

    orderBy(field, direction = 'asc') {
        this.orderByFields.push(`${field} ${direction}`);
        return this;
    }

    expand(field, subQuery = null) {
        if (subQuery) {
            this.expandFields.push(`${field}(${subQuery})`);
        } else {
            this.expandFields.push(field);
        }
        return this;
    }

    top(n) {
        this.topValue = n;
        return this;
    }

    skip(n) {
        this.skipValue = n;
        return this;
    }

    build() {
        let query = this.entitySet;
        const params = [];

        if (this.filters.length > 0) {
            params.push(`$filter=${this.filters.join(' and ')}`);
        }

        if (this.selectFields.length > 0) {
            params.push(`$select=${this.selectFields.join(',')}`);
        }

        if (this.orderByFields.length > 0) {
            params.push(`$orderby=${this.orderByFields.join(',')}`);
        }

        if (this.expandFields.length > 0) {
            params.push(`$expand=${this.expandFields.join(',')}`);
        }

        if (this.topValue !== null) {
            params.push(`$top=${this.topValue}`);
        }

        if (this.skipValue !== null) {
            params.push(`$skip=${this.skipValue}`);
        }

        if (params.length > 0) {
            query += '?' + params.join('&');
        }

        return query;
    }

    toString() {
        return this.build();
    }
}

// Uso
const query = new QueryBuilder('BusinessPartners')
    .select('CardCode', 'CardName', 'EmailAddress')
    .where('CardType', 'eq', 'cCustomer')
    .where('Valid', 'eq', 'tYES')
    .whereIn('GroupCode', [100, 101, 102])
    .orderBy('CardName', 'asc')
    .top(50)
    .build();

console.log(query);
// BusinessPartners?$filter=CardType eq 'cCustomer' and Valid eq 'tYES' and (GroupCode eq 100 or GroupCode eq 101 or GroupCode eq 102)&$select=CardCode,CardName,EmailAddress&$orderby=CardName asc&$top=50

// Con expand
const orderQuery = new QueryBuilder('Orders')
    .select('DocEntry', 'DocNum', 'CardCode', 'DocTotal')
    .expand('DocumentLines', '$select=ItemCode,Quantity,Price')
    .where('DocDate', 'ge', '2024-01-01')
    .orderBy('DocEntry', 'desc')
    .top(10)
    .build();
```

---

## Ejemplos Completos {#ejemplos}

### EJEMPLO #1: Crear Orden de Venta Completa

```javascript
async function createSalesOrder(orderData) {
    // Validar datos de entrada
    if (!orderData.CardCode) {
        throw new Error('CardCode is required');
    }

    if (!orderData.lines || orderData.lines.length === 0) {
        throw new Error('Order must have at least one line');
    }

    // Verificar que el Business Partner existe
    const bpExists = await serviceLayer.request('GET',
        `BusinessPartners('${orderData.CardCode}')?$select=CardCode`
    );

    if (!bpExists.ok) {
        throw new Error(`Business Partner ${orderData.CardCode} not found`);
    }

    // Verificar stock de items
    for (const line of orderData.lines) {
        const item = await serviceLayer.request('GET',
            `Items('${line.ItemCode}')?$select=ItemCode,QuantityOnStock,ItemName`
        );

        if (!item.ok) {
            throw new Error(`Item ${line.ItemCode} not found`);
        }

        const itemData = await item.json();
        
        if (itemData.QuantityOnStock < line.Quantity) {
            throw new Error(
                `Insufficient stock for item ${line.ItemCode}. ` +
                `Available: ${itemData.QuantityOnStock}, Requested: ${line.Quantity}`
            );
        }
    }

    // Construir objeto de orden
    const order = {
        CardCode: orderData.CardCode,
        DocDate: orderData.DocDate || new Date().toISOString().split('T')[0],
        DocDueDate: orderData.DocDueDate,
        Comments: orderData.Comments || '',
        SalesPersonCode: orderData.SalesPersonCode || -1,
        DocumentLines: orderData.lines.map(line => ({
            ItemCode: line.ItemCode,
            Quantity: line.Quantity,
            Price: line.Price,
            DiscountPercent: line.DiscountPercent || 0,
            WarehouseCode: line.WarehouseCode || '01',
            TaxCode: line.TaxCode || 'ITBIS'
        }))
    };

    // Crear la orden
    try {
        const response = await serviceLayer.request('POST', 'Orders', order);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error.message.value);
        }

        const createdOrder = await response.json();

        console.log(`Order created successfully: DocEntry ${createdOrder.DocEntry}`);

        return {
            success: true,
            docEntry: createdOrder.DocEntry,
            docNum: createdOrder.DocNum,
            docTotal: createdOrder.DocTotal
        };

    } catch (error) {
        console.error('Error creating sales order:', error);
        throw error;
    }
}

// Uso
const orderResult = await createSalesOrder({
    CardCode: 'C00001',
    DocDate: '2024-02-09',
    DocDueDate: '2024-02-16',
    Comments: 'Rush order',
    SalesPersonCode: 1,
    lines: [
        {
            ItemCode: 'A00001',
            Quantity: 10,
            Price: 50.00,
            DiscountPercent: 5,
            WarehouseCode: '01',
            TaxCode: 'ITBIS'
        },
        {
            ItemCode: 'A00002',
            Quantity: 5,
            Price: 100.00,
            TaxCode: 'ITBIS'
        }
    ]
});
```

### EJEMPLO #2: Sistema de Sincronización con Rate Limiting

```javascript
class DataSynchronizer {
    constructor(serviceLayer, options = {}) {
        this.serviceLayer = serviceLayer;
        this.batchSize = options.batchSize || 50;
        this.delayBetweenBatches = options.delayBetweenBatches || 1000;
        this.maxRetries = options.maxRetries || 3;
    }

    async syncBusinessPartners(externalData) {
        const results = {
            created: 0,
            updated: 0,
            failed: 0,
            errors: []
        };

        console.log(`Starting sync of ${externalData.length} Business Partners...`);

        // Procesar en lotes
        for (let i = 0; i < externalData.length; i += this.batchSize) {
            const batch = externalData.slice(i, i + this.batchSize);
            
            console.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}...`);

            for (const data of batch) {
                try {
                    await this.syncSingleBusinessPartner(data, results);
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        cardCode: data.CardCode,
                        error: error.message
                    });
                    console.error(`Failed to sync ${data.CardCode}:`, error.message);
                }
            }

            // Esperar entre lotes para no sobrecargar el servidor
            if (i + this.batchSize < externalData.length) {
                await sleep(this.delayBetweenBatches);
            }
        }

        console.log('Sync completed:', results);
        return results;
    }

    async syncSingleBusinessPartner(data, results) {
        // Verificar si existe
        const exists = await this.checkIfExists('BusinessPartners', data.CardCode);

        if (exists) {
            // Actualizar
            await this.serviceLayer.request('PATCH',
                `BusinessPartners('${data.CardCode}')`,
                {
                    CardName: data.CardName,
                    Phone1: data.Phone1,
                    EmailAddress: data.EmailAddress,
                    Notes: `Last synced: ${new Date().toISOString()}`
                }
            );
            results.updated++;
            console.log(`Updated: ${data.CardCode}`);

        } else {
            // Crear
            await this.serviceLayer.request('POST',
                'BusinessPartners',
                {
                    CardCode: data.CardCode,
                    CardName: data.CardName,
                    CardType: data.CardType || 'cCustomer',
                    Phone1: data.Phone1,
                    EmailAddress: data.EmailAddress,
                    Notes: `Created via sync: ${new Date().toISOString()}`
                }
            );
            results.created++;
            console.log(`Created: ${data.CardCode}`);
        }
    }

    async checkIfExists(entitySet, key) {
        try {
            const response = await this.serviceLayer.request('GET',
                `${entitySet}('${key}')?$select=CardCode`
            );
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

// Uso
const sync = new DataSynchronizer(serviceLayer, {
    batchSize: 50,
    delayBetweenBatches: 2000, // 2 segundos entre lotes
    maxRetries: 3
});

const externalData = [
    { CardCode: 'C10001', CardName: 'Customer A', Phone1: '555-1111' },
    { CardCode: 'C10002', CardName: 'Customer B', Phone1: '555-2222' },
    // ... más datos
];

const syncResults = await sync.syncBusinessPartners(externalData);
```

### EJEMPLO #3: Reporte de Ventas con Datos Relacionados

```javascript
async function generateSalesReport(dateFrom, dateTo) {
    console.log(`Generating sales report from ${dateFrom} to ${dateTo}...`);

    // Query con expand para traer todas las relaciones en una sola llamada
    const query = new QueryBuilder('Invoices')
        .select('DocEntry', 'DocNum', 'DocDate', 'CardCode', 'CardName', 'DocTotal')
        .expand('DocumentLines', '$select=ItemCode,ItemDescription,Quantity,Price,LineTotal')
        .where('DocDate', 'ge', dateFrom)
        .where('DocDate', 'le', dateTo)
        .where('DocumentStatus', 'eq', 'bost_Close')
        .orderBy('DocDate', 'desc')
        .build();

    const response = await serviceLayer.request('GET', query);
    const data = await response.json();
    const invoices = data.value;

    // Agrupar por cliente
    const salesByCustomer = {};
    let totalSales = 0;

    for (const invoice of invoices) {
        const cardCode = invoice.CardCode;

        if (!salesByCustomer[cardCode]) {
            salesByCustomer[cardCode] = {
                CardCode: cardCode,
                CardName: invoice.CardName,
                InvoiceCount: 0,
                TotalSales: 0,
                Items: {}
            };
        }

        salesByCustomer[cardCode].InvoiceCount++;
        salesByCustomer[cardCode].TotalSales += invoice.DocTotal;
        totalSales += invoice.DocTotal;

        // Agrupar por item
        for (const line of invoice.DocumentLines) {
            const itemCode = line.ItemCode;

            if (!salesByCustomer[cardCode].Items[itemCode]) {
                salesByCustomer[cardCode].Items[itemCode] = {
                    ItemCode: itemCode,
                    ItemDescription: line.ItemDescription,
                    Quantity: 0,
                    Revenue: 0
                };
            }

            salesByCustomer[cardCode].Items[itemCode].Quantity += line.Quantity;
            salesByCustomer[cardCode].Items[itemCode].Revenue += line.LineTotal;
        }
    }

    // Convertir a array y ordenar por ventas
    const reportData = Object.values(salesByCustomer)
        .sort((a, b) => b.TotalSales - a.TotalSales)
        .map(customer => ({
            ...customer,
            Items: Object.values(customer.Items)
        }));

    // Generar reporte
    const report = {
        period: {
            from: dateFrom,
            to: dateTo
        },
        summary: {
            totalInvoices: invoices.length,
            totalCustomers: reportData.length,
            totalSales: totalSales.toFixed(2)
        },
        customers: reportData
    };

    console.log('Report generated successfully');
    console.log(`Total Invoices: ${report.summary.totalInvoices}`);
    console.log(`Total Sales: $${report.summary.totalSales}`);

    return report;
}

// Uso
const report = await generateSalesReport('2024-01-01', '2024-01-31');

// Top 5 clientes
console.log('\nTop 5 Customers:');
report.customers.slice(0, 5).forEach((customer, index) => {
    console.log(
        `${index + 1}. ${customer.CardName}: ` +
        `$${customer.TotalSales.toFixed(2)} (${customer.InvoiceCount} invoices)`
    );
});
```

---

## Checklist de Buenas Prácticas

Antes de desplegar código que usa Service Layer, verifica:

- [ ] **Autenticación**: ¿Reutilizas sesiones? ¿Usas auto-refresh?
- [ ] **Seguridad**: ¿HTTPS obligatorio? ¿Sin credenciales hardcodeadas? ¿Input sanitizado?
- [ ] **Queries**: ¿Usas `$select` para limitar campos? ¿Paginación para listas grandes?
- [ ] **Filtros**: ¿Filtras en servidor con `$filter`? ¿No en cliente?
- [ ] **Actualizaciones**: ¿Usas PATCH en lugar de PUT?
- [ ] **Errores**: ¿Manejo estructurado? ¿Retry logic para errores transitorios?
- [ ] **Rendimiento**: ¿Caché para datos maestros? ¿Batch cuando sea apropiado?
- [ ] **Rate Limiting**: ¿Proteges contra sobrecarga del servidor?
- [ ] **Logging**: ¿Registras operaciones importantes? ¿Sin exponer datos sensibles?
- [ ] **Testing**: ¿Pruebas en entorno de desarrollo primero?

---

## Recursos Adicionales

- **Documentación Oficial**: SAP Business One Service Layer API Reference
- **Postman Collection**: Disponible en SAP Help Portal
- **Community**: SAP Community para SAP Business One

---

## Notas Finales

Este documento representa las mejores prácticas acumuladas del trabajo con Service Layer de SAP Business One HANA. Siempre adapta estas prácticas a tu contexto específico y requisitos de negocio.

**Recuerda**: El código limpio, bien estructurado y mantenible es más importante que el código "clever". Prioriza la legibilidad y la robustez sobre la brevedad.

---

**Última actualización**: Febrero 2024  
**Versión**: 1.0
