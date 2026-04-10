# SAP B1 Service Layer - Referencia Rápida

Esta es una guía de referencia rápida con ejemplos de código listos para usar.

## Configuración Inicial

```javascript
// Configuración del cliente
const config = {
    baseUrl: 'https://servidor:50000/b1s/v1',
    companyDB: 'SBODemoUS',
    username: process.env.SAP_USERNAME,
    password: process.env.SAP_PASSWORD
};

// Crear instancia
const sl = new ServiceLayerClient(config.baseUrl, config.companyDB);
await sl.login(config.username, config.password);
```

## Login y Logout

```javascript
// Login
const sessionId = await sl.login('manager', 'password');

// Mantener sesión viva
await sl.ping();

// Logout
await sl.logout();
```

## Business Partners

### Crear Cliente
```javascript
const newCustomer = await sl.request('POST', 'BusinessPartners', {
    CardCode: 'C00100',
    CardName: 'Acme Corporation',
    CardType: 'cCustomer',
    GroupCode: 100,
    Currency: 'USD',
    EmailAddress: 'contact@acme.com',
    Phone1: '555-1234'
});
```

### Consultar Cliente
```javascript
// Traer todos los campos
const customer = await sl.request('GET', "BusinessPartners('C00100')");

// Solo campos específicos
const customer = await sl.request('GET', 
    "BusinessPartners('C00100')?$select=CardCode,CardName,EmailAddress"
);
```

### Actualizar Cliente
```javascript
await sl.request('PATCH', "BusinessPartners('C00100')", {
    EmailAddress: 'newemail@acme.com',
    Phone1: '555-9999'
});
```

### Listar Clientes con Filtros
```javascript
const query = 
    "BusinessPartners?" +
    "$filter=CardType eq 'cCustomer' and Valid eq 'tYES'" +
    "&$select=CardCode,CardName,EmailAddress" +
    "&$orderby=CardName asc" +
    "&$top=50";

const result = await sl.request('GET', query);
const customers = result.value;
```

## Items (Artículos)

### Crear Item
```javascript
const newItem = await sl.request('POST', 'Items', {
    ItemCode: 'A00100',
    ItemName: 'Product A',
    ItemsGroupCode: 100,
    InventoryItem: 'tYES',
    SalesItem: 'tYES',
    PurchaseItem: 'tYES',
    QuantityOnStock: 100,
    ItemPrices: [
        {
            PriceList: 1,
            Price: 99.99,
            Currency: 'USD'
        }
    ]
});
```

### Consultar Item con Stock
```javascript
const item = await sl.request('GET',
    "Items('A00100')?$select=ItemCode,ItemName,QuantityOnStock,ItemPrices"
);
```

### Actualizar Precio
```javascript
await sl.request('PATCH', "Items('A00100')", {
    ItemPrices: [
        {
            PriceList: 1,
            Price: 109.99
        }
    ]
});
```

## Órdenes de Venta

### Crear Orden
```javascript
const order = await sl.request('POST', 'Orders', {
    CardCode: 'C00100',
    DocDate: '2024-02-09',
    DocDueDate: '2024-02-16',
    Comments: 'Orden urgente',
    DocumentLines: [
        {
            ItemCode: 'A00100',
            Quantity: 10,
            Price: 99.99,
            DiscountPercent: 5,
            WarehouseCode: '01',
            TaxCode: 'TAX'
        },
        {
            ItemCode: 'A00200',
            Quantity: 5,
            Price: 149.99,
            WarehouseCode: '01',
            TaxCode: 'TAX'
        }
    ]
});

console.log(`Orden creada: ${order.DocEntry}`);
```

### Consultar Orden con Líneas
```javascript
const order = await sl.request('GET',
    "Orders(123)?$select=DocEntry,DocNum,CardCode,DocTotal" +
    "&$expand=DocumentLines($select=ItemCode,Quantity,Price,LineTotal)"
);
```

### Actualizar Líneas
```javascript
await sl.request('PATCH', 'Orders(123)', {
    Comments: 'Comentarios actualizados',
    DocumentLines: [
        {
            LineNum: 0,
            Quantity: 15  // Actualizar línea existente
        },
        {
            ItemCode: 'A00300',  // Agregar nueva línea
            Quantity: 3,
            Price: 79.99
        }
    ]
});
```

### Cerrar Orden
```javascript
await sl.request('POST', 'Orders(123)/Close', {});
```

### Cancelar Orden
```javascript
await sl.request('POST', 'Orders(123)/Cancel', {});
```

## Facturas de Venta

### Crear Factura desde Orden
```javascript
const invoice = await sl.request('POST', 'Invoices', {
    CardCode: 'C00100',
    DocDate: '2024-02-09',
    BaseEntry: 123,  // DocEntry de la orden
    BaseType: 17,    // 17 = Orden de Venta
    DocumentLines: [
        {
            BaseEntry: 123,
            BaseLine: 0,
            BaseType: 17
        }
    ]
});
```

### Crear Factura Directa
```javascript
const invoice = await sl.request('POST', 'Invoices', {
    CardCode: 'C00100',
    DocDate: '2024-02-09',
    DocDueDate: '2024-03-09',
    DocumentLines: [
        {
            ItemCode: 'A00100',
            Quantity: 10,
            Price: 99.99,
            TaxCode: 'TAX'
        }
    ]
});
```

## Pagos Recibidos

### Registrar Pago
```javascript
const payment = await sl.request('POST', 'IncomingPayments', {
    CardCode: 'C00100',
    DocDate: '2024-02-09',
    CashSum: 1000.00,
    CashAccount: '10100',  // Cuenta contable
    PaymentInvoices: [
        {
            DocEntry: 456,  // DocEntry de la factura
            SumApplied: 1000.00
        }
    ]
});
```

## Consultas Comunes

### Facturas Pendientes de un Cliente
```javascript
const query = 
    "Invoices?" +
    "$filter=CardCode eq 'C00100' and DocumentStatus eq 'bost_Open'" +
    "&$select=DocEntry,DocNum,DocDate,DocTotal,DocBalance" +
    "&$orderby=DocDate desc";

const result = await sl.request('GET', query);
const openInvoices = result.value;
```

### Stock por Almacén
```javascript
const query = 
    "Items('A00100')/ItemWarehouseInfoCollection?" +
    "$select=WarehouseCode,InStock,Committed,Ordered";

const result = await sl.request('GET', query);
const stockByWarehouse = result.value;
```

### Ventas del Mes
```javascript
const query = 
    "Invoices?" +
    "$filter=DocDate ge '2024-02-01' and DocDate le '2024-02-29'" +
    "&$select=DocEntry,DocNum,CardCode,CardName,DocTotal,DocDate" +
    "&$orderby=DocDate desc";

const result = await sl.request('GET', query);
const salesThisMonth = result.value;
```

### Top 10 Clientes
```javascript
// Nota: Esto requiere lógica adicional en el cliente
const allInvoices = await sl.request('GET',
    "Invoices?$filter=DocDate ge '2024-01-01'" +
    "&$select=CardCode,CardName,DocTotal"
);

// Agrupar y sumar en el cliente
const salesByCustomer = {};
allInvoices.value.forEach(inv => {
    if (!salesByCustomer[inv.CardCode]) {
        salesByCustomer[inv.CardCode] = {
            CardCode: inv.CardCode,
            CardName: inv.CardName,
            Total: 0
        };
    }
    salesByCustomer[inv.CardCode].Total += inv.DocTotal;
});

// Ordenar y tomar top 10
const top10 = Object.values(salesByCustomer)
    .sort((a, b) => b.Total - a.Total)
    .slice(0, 10);
```

## Operadores de Filtro

```javascript
// Igualdad
$filter=CardCode eq 'C00100'

// No igual
$filter=CardCode ne 'C00100'

// Mayor que / Menor que
$filter=DocTotal gt 1000
$filter=DocTotal lt 5000
$filter=DocTotal ge 1000  // Greater or Equal
$filter=DocTotal le 5000  // Less or Equal

// AND / OR
$filter=CardType eq 'cCustomer' and Valid eq 'tYES'
$filter=CardCode eq 'C001' or CardCode eq 'C002'

// Contains
$filter=substringof('ACME', CardName)

// Starts with
$filter=startswith(CardName, 'A')

// Ends with
$filter=endswith(CardCode, '100')

// Fechas
$filter=DocDate ge '2024-01-01' and DocDate le '2024-12-31'

// Null / Not Null
$filter=EmailAddress eq null
$filter=EmailAddress ne null
```

## Funciones de Agregación (SQLQueries)

```javascript
// Crear Query
const query = await sl.request('POST', 'SQLQueries', {
    SqlCode: 'TotalSales',
    SqlName: 'Total Sales by Customer',
    SqlText: `
        SELECT 
            T0.CardCode,
            T0.CardName,
            SUM(T1.DocTotal) as TotalSales
        FROM OCRD T0
        INNER JOIN OINV T1 ON T0.CardCode = T1.CardCode
        WHERE T1.DocDate >= ?
        GROUP BY T0.CardCode, T0.CardName
        ORDER BY TotalSales DESC
    `
});

// Ejecutar Query
const result = await sl.request('POST', 
    "SQLQueries('TotalSales')/List",
    {
        Parameters: ['2024-01-01']
    }
);
```

## Batch Operations

```javascript
// Crear múltiples items en una transacción
const batchId = `batch_${Date.now()}`;
const changesetId = `changeset_${Date.now()}`;

const batchBody = `
--${batchId}
Content-Type: multipart/mixed; boundary=${changesetId}

--${changesetId}
Content-Type: application/http
Content-Transfer-Encoding: binary

POST Items HTTP/1.1
Content-Type: application/json

{"ItemCode":"A00101","ItemName":"Item 1"}

--${changesetId}
Content-Type: application/http
Content-Transfer-Encoding: binary

POST Items HTTP/1.1
Content-Type: application/json

{"ItemCode":"A00102","ItemName":"Item 2"}

--${changesetId}--
--${batchId}--
`;

const response = await fetch(`${baseUrl}/$batch`, {
    method: 'POST',
    headers: {
        'Content-Type': `multipart/mixed; boundary=${batchId}`,
        'Cookie': `B1SESSION=${sessionId}`
    },
    body: batchBody
});
```

## Manejo de Errores

```javascript
try {
    const result = await sl.request('POST', 'BusinessPartners', data);
    console.log('Success:', result);
} catch (error) {
    if (error.code === 'CONFLICT') {
        console.error('Ya existe:', error.message);
    } else if (error.code === 'BAD_REQUEST') {
        console.error('Datos inválidos:', error.details);
    } else {
        console.error('Error:', error.message);
    }
}
```

## Mejores Prácticas Rápidas

1. ✅ Siempre usar `$select` para limitar campos
2. ✅ Usar PATCH para actualizaciones, no PUT
3. ✅ Implementar paginación con `$top` y `$skip`
4. ✅ Reutilizar sesiones, no crear nuevas en cada request
5. ✅ Usar `$expand` para datos relacionados
6. ✅ Filtrar en servidor con `$filter`, no en cliente
7. ✅ Siempre HTTPS en producción (puerto 50000)
8. ✅ Sanitizar inputs antes de enviar
9. ✅ Implementar retry logic para errores transitorios
10. ✅ Usar rate limiting para no sobrecargar el servidor

---

**Tip**: Guarda esta referencia como favorito para acceso rápido durante el desarrollo.
