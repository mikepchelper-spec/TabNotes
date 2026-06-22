<div align="center">

# TabNotes

**Notas contextuales para la página, dominio, espacio de trabajo o contexto del navegador donde estás trabajando.**

<p>
  <a href="README.md"><img alt="Language: English" src="https://img.shields.io/badge/Language-English-2f3138?style=for-the-badge&labelColor=111215"></a>
  <a href="README.es.md"><img alt="Idioma: Español" src="https://img.shields.io/badge/Idioma-Espa%C3%B1ol-ffd84d?style=for-the-badge&labelColor=111215"></a>
</p>

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Publicada-ffd84d?logo=googlechrome&logoColor=111215)](https://chromewebstore.google.com/detail/tabnotes/pniapenkdphjolncppcichbahomfiffj)
[![Versión](https://img.shields.io/badge/versi%C3%B3n-2.11.0-79a7ff)](./tabnotes-extension.zip)
[![Manifest](https://img.shields.io/badge/Manifest-V3-7ee0a1)](apps/extension/public/manifest.json)
[![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-ffffff)](LICENSE)

**Notas que saben dónde estás.**

[Instalar desde Chrome Web Store](https://chromewebstore.google.com/detail/tabnotes/pniapenkdphjolncppcichbahomfiffj) ·
[Sitio del producto](https://tabnotes.atlaspcsupport.com/) ·
[Privacidad](https://tabnotes.atlaspcsupport.com/privacy/)

</div>

![Captura del editor de TabNotes](store/assets-final-20260619/01-editor-url-note-1280x800.png)

## Versión Actual

| Elemento | Valor |
|---|---|
| Versión pública | `2.11.0` |
| ID de Chrome Web Store | `pniapenkdphjolncppcichbahomfiffj` |
| Paquete ZIP | [`tabnotes-extension.zip`](./tabnotes-extension.zip) |
| Sitio del producto | `https://tabnotes.atlaspcsupport.com/` |
| Política de privacidad | `https://tabnotes.atlaspcsupport.com/privacy/` |
| Términos | `https://tabnotes.atlaspcsupport.com/terms/` |
| Ruta PWA móvil | `/app` en `apps/web` |

## Qué Hace TabNotes

TabNotes es una extensión de Chrome local-first que mantiene tus notas conectadas al contexto del navegador donde realmente importan:

- **Notas por URL** para una página exacta.
- **Notas por dominio** para un sitio web o aplicación completa.
- **Notas por workspace** para proyectos, clientes, tareas o flujos de soporte.
- **Notas globales** para un bloc siempre disponible.

La extensión funciona en el panel lateral de Chrome, guarda automáticamente en local, permite varias notas por contexto y puede sincronizar opcionalmente con tu carpeta privada de datos de aplicación de Google Drive.

## Funciones Principales

| Área | Funciones |
|---|---|
| Escritura | Texto enriquecido, vista Markdown, plantillas, checklist, alineación, colores, historial de notas |
| Organización | Workspaces, carpetas, etiquetas, notas fijadas, colores, búsqueda, grafo de notas |
| Productividad | Paleta de comandos, recorte contextual, recordatorios, digest diario, avisos de backup |
| Privacidad | Almacenamiento local-first, exportar/restaurar JSON, sync opcional en Drive appData, cifrado por nota, bloqueo con PIN |
| Idiomas | Interfaz en español e inglés |

## PWA Móvil

La PWA complementaria vive en `apps/web` y expone una ruta móvil en `/app`.
Usa el mismo archivo privado de Google Drive `appDataFolder` que la extensión, con un envelope de sincronización v2 que soporta tombstones para borrados y copias de conflicto cuando dos dispositivos editan la misma nota después del último sync.

Para que Drive funcione en la PWA, crea un cliente OAuth de Google de tipo **Aplicación web** y configura `VITE_GOOGLE_CLIENT_ID` antes de compilar o desplegar la web.
Para desplegar bajo `https://tabnotes.atlaspcsupport.com/app/`, compila con `VITE_BASE_PATH=/app/` y `VITE_TABNOTES_MOBILE_ENTRY=true`.
El build de GitHub Pages también escribe `/app/tabnotes.config.json`, así que el OAuth client ID público de la web puede actualizarse sin cambiar el bundle de la aplicación.

## Capturas

| Búsqueda y notas | Sync en Google Drive |
|---|---|
| ![Búsqueda y todas las notas](store/assets-final-20260619/02-search-and-all-notes-1280x800.png) | ![Ajustes de sync en Drive](store/assets-final-20260619/03-drive-backup-settings-1280x800.png) |

| Recordatorios | Workspaces |
|---|---|
| ![Recordatorios](store/assets-final-20260619/04-reminders-1280x800.png) | ![Workspaces](store/assets-final-20260619/05-workspaces-light-mode-1280x800.png) |

## Modelo de Privacidad

TabNotes no usa un servidor propio para tus notas.

- Las notas se guardan localmente en `chrome.storage.local` por defecto.
- La exportación manual crea un archivo JSON controlado por el usuario.
- El sync opcional de Google Drive usa solo `https://www.googleapis.com/auth/drive.appdata`.
- Los datos de sync se guardan en la carpeta privada de datos de aplicación de tu Google Drive.
- La extensión no incluye publicidad, analíticas, telemetría ni tracking.

## Instalación Manual Desde ZIP

La instalación recomendada es Chrome Web Store. Para pruebas locales:

1. Descarga [`tabnotes-extension.zip`](./tabnotes-extension.zip).
2. Descomprime el archivo.
3. Abre Chrome y entra a `chrome://extensions`.
4. Activa **Modo de desarrollador**.
5. Pulsa **Cargar descomprimida**.
6. Selecciona la carpeta `dist` extraída.

## Desarrollo

```bash
pnpm install
pnpm --filter @tabnotes/shared typecheck
pnpm --filter @tabnotes/web typecheck
pnpm --filter @tabnotes/extension typecheck
pnpm --filter @tabnotes/extension e2e
pnpm --filter @tabnotes/extension build
```

## Estructura del Repositorio

```text
apps/
  extension/       Extensión Chrome MV3
  tabnotes-site/   Sitio público estático del producto, privacidad y términos
  web/             App web/PWA complementaria para acceso móvil
packages/
  shared/          Storage, backup, crypto, markdown y utilidades
  i18n/            Traducciones en inglés y español
  ui/              Primitivas UI compartidas
store/             Texto de Chrome Web Store y capturas finales
```

## Licencia

[MIT](LICENSE).
