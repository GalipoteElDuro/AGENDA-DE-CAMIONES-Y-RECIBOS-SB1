# SAP Business One HANA Service Layer - Skill

Esta es una skill personalizada para Claude que proporciona conocimiento experto sobre el manejo del Service Layer de SAP Business One HANA.

## ¿Qué es una Skill?

Una "skill" es un conjunto de instrucciones y mejores prácticas que ayuda a Claude a proporcionar asistencia de alta calidad en un tema específico. En este caso, la skill cubre todo lo necesario para trabajar con el Service Layer de SAP B1 HANA.

## ¿Qué incluye esta Skill?

La skill cubre los siguientes temas:

1. **Fundamentos del Service Layer**: Arquitectura y conceptos básicos
2. **Autenticación y Sesiones**: Manejo correcto de login, logout y sesiones persistentes
3. **Operaciones CRUD**: Create, Read, Update, Delete con mejores prácticas
4. **Consultas Avanzadas**: Filtros, ordenamiento, paginación y expansión de datos
5. **Manejo de Errores**: Estructura robusta para manejar errores del Service Layer
6. **Optimización y Rendimiento**: Técnicas para mejorar el rendimiento
7. **Seguridad**: Prácticas para mantener la seguridad de las integraciones
8. **Patrones de Diseño**: Repository Pattern, Unit of Work, Query Builder
9. **Ejemplos Completos**: Casos de uso reales implementados

## Cómo usar esta Skill

### Opción 1: Uso Local (sin instalación en Claude)

Si quieres usar esta skill para consulta personal:

1. Abre el archivo `SKILL.md`
2. Úsalo como referencia mientras desarrollas
3. Copia los ejemplos de código y adáptalos a tus necesidades

### Opción 2: Instalación como Skill de Usuario en Claude

Para que Claude tenga acceso automático a esta skill:

1. Copia la carpeta `sap-b1-service-layer` a la ubicación de skills de usuario:
   ```
   /mnt/skills/user/sap-b1-service-layer/
   ```

2. Reinicia tu sesión con Claude

3. Ahora cuando le preguntes a Claude sobre SAP B1 Service Layer, automáticamente usará esta skill

### Opción 3: Compartir con tu Equipo

Si quieres que tu equipo tenga acceso a esta skill:

1. Sube el archivo `SKILL.md` a un repositorio compartido
2. Comparte el enlace con tu equipo
3. Cada miembro puede usarlo como referencia

## Ejemplos de Uso

### Pregunta a Claude:

> "Muéstrame cómo crear un Business Partner usando el Service Layer de SAP B1 con todas las validaciones necesarias"

Claude usará la skill para proporcionar un ejemplo completo con validaciones, manejo de errores y mejores prácticas.

### Otro ejemplo:

> "¿Cómo puedo optimizar mis queries al Service Layer para traer órdenes de venta con sus líneas?"

Claude consultará la sección de optimización y te mostrará cómo usar `$expand` y `$select` correctamente.

## Contenido de la Skill

La skill está organizada en secciones que cubren:

- ✅ 20+ buenas prácticas documentadas
- ✅ Ejemplos de código en JavaScript/TypeScript
- ✅ Patrones de diseño (Repository, Unit of Work, Query Builder)
- ✅ Manejo robusto de errores
- ✅ Optimización de rendimiento
- ✅ Seguridad y sanitización
- ✅ Ejemplos completos de casos de uso reales

## Personalización

Puedes personalizar esta skill:

1. Agrega tus propias buenas prácticas en el archivo SKILL.md
2. Incluye ejemplos específicos de tu empresa
3. Añade casos de uso particulares de tu implementación

## Contribuciones

Si encuentras mejoras o tienes sugerencias:

1. Documenta la mejora
2. Agrega ejemplos si es relevante
3. Actualiza la versión en el archivo SKILL.md

## Soporte

Para preguntas sobre:
- **SAP Business One**: Consulta la documentación oficial de SAP
- **Service Layer API**: Revisa el API Reference de SAP
- **Esta Skill**: Contacta al creador de la skill

## Licencia

Esta skill es de uso libre para tu organización. Puedes modificarla y distribuirla según tus necesidades.

---

**Creado**: Febrero 2024  
**Versión**: 1.0  
**Compatibilidad**: SAP Business One HANA Service Layer v1
