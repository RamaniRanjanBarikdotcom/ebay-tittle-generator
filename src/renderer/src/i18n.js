export const translations = {
  en: {
    appTitle: 'eBay Title Generator',
    menu: {
      import: 'Import',
      generate: 'Generate',
      review: 'Review',
      export: 'Export',
      history: 'History',
      logs: 'Logs',
      settings: 'Settings'
    },
    header: {
      light: 'Light',
      dark: 'Dark',
      systemLanguage: 'System language'
    },
    import: {
      title: 'Import Products',
      subtitle: 'Import your product catalog from Excel or JTL.',
      excelImport: 'Excel Import',
      excelTab: 'Excel',
      selectExcel: 'Select Excel File',
      dragText: 'Drag & drop an Excel file here',
      dragHint: 'Accepted: .xlsx or .xls',
      importBtn: 'Import',
      reset: 'Reset',
      preview: 'Data Preview',
      jtlTab: 'JTL Data',
      jtlTitle: 'JTL Import',
      jtlHint: 'Uses the active database profile to load JTL item data.',
      importJtl: 'Load JTL Data',
      empty: 'No data imported yet. Import a file to preview detected products.'
    },
    generate: {
      title: 'Generate Titles',
      subtitle: 'Generated output uses the current system language.',
      settings: 'Generation Settings',
      systemLanguage: 'System language',
      marketNotice: 'Marketplace: eBay.de (titles generated in German)',
      generateBtn: 'Generate Titles',
      preview: 'Preview',
      empty: 'Import products to see generated title previews.',
      tagVariations: '3 variations per product',
      tagLimit: '80 character limit',
      tagDuplicate: 'Duplicate safe'
    },
    review: {
      title: 'Review Titles',
      subtitle: 'Inspect and edit generated titles before exporting them.',
      empty: 'No generated titles yet.',
      errorEmpty: 'Title cannot be empty',
      errorLength: 'Title exceeds 80 characters',
      errorDuplicate: 'Duplicate title detected',
      saved: 'Title updated'
    },
    export: {
      title: 'Export Titles',
      subtitle: 'Export your finalized titles to Excel or CSV.',
      excel: 'Excel Export',
      excelBtn: 'Export Excel',
      csv: 'CSV Export',
      csvBtn: 'Export CSV'
    },
    messages: {
      importSuccess: 'Import completed',
      generateSuccess: 'Titles generated',
      exportSuccess: 'Export completed',
      missingSheetConfig: 'Provide credentials and spreadsheet ID',
      missingExcel: 'Select an Excel file first',
      generationFailed: 'Generation failed',
      noTitlesExport: 'No generated titles to export'
    },
    history: {
      title: 'History',
      subtitle: 'Audit trail of imports, generations, and exports.',
      empty: 'No history records yet.',
      action: 'Action',
      destination: 'Destination',
      details: 'Details',
      date: 'Date',
      itemNumber: 'Item number',
      sku: 'SKU',
      oldTitle: 'Old title',
      newTitle: 'New title',
      createdAt: 'Created at'
    },
    logs: {
      title: 'System Logs',
      subtitle: 'Track imports, generation, pricing updates, and delivery events.'
    },
    settings: {
      title: 'Settings',
      subtitle: 'Manage default language and UI preferences.',
      tabGeneral: 'General',
      tabDatabase: 'Database',
      language: 'Language',
      appearance: 'Appearance',
      lightTheme: 'Light theme',
      marketNote: 'Titles are generated for eBay.de (German).',
      dbTitle: 'Database Connections',
      dbProfiles: 'Saved profiles',
      dbSelectProfile: 'Select profile',
      dbActiveProfile: 'Active profile',
      dbSetActive: 'Choose active profile',
      dbProfileName: 'Profile name',
      dbAuthentication: 'Authentication',
      dbAuthSql: 'SQL Authentication',
      dbAuthWindows: 'Windows Authentication',
      dbServer: 'Server name',
      dbDatabase: 'Database name',
      dbPort: 'Port',
      dbUser: 'User',
      dbPassword: 'Password',
      dbQuery: 'JTL import query',
      dbNew: 'New profile',
      dbTest: 'Test connection',
      dbSave: 'Save profile',
      dbDelete: 'Delete profile',
      dbHint: 'JTL import query is read-only (SELECT only) and managed automatically.',
      dbTestSuccess: 'Database connection successful',
      dbTestFailed: 'Database connection failed',
      dbSaveSuccess: 'Database profile saved',
      dbSaveFailed: 'Failed to save database profile',
      dbDeleteSuccess: 'Database profile deleted',
      dbDeleteFailed: 'Failed to delete database profile',
      dbAgentTitle: 'SQL Server Agent',
      dbAgentEnabled: 'Auto connect',
      dbAgentInterval: 'Retry interval',
      dbAgentStatus: 'Status',
      dbAgentMessage: 'Message',
      dbAgentConnected: 'Connected',
      dbAgentDisconnected: 'Disconnected',
      dbAgentNoStatus: 'No agent status yet',
      dbAgentRefresh: 'Connect now',
      dbAgentUpdateFailed: 'Failed to update SQL agent settings'
    }
  },
  de: {
    appTitle: 'eBay Titel-Generator',
    menu: {
      import: 'Import',
      generate: 'Generieren',
      review: 'Prüfen',
      export: 'Export',
      history: 'Verlauf',
      logs: 'Logs',
      settings: 'Einstellungen'
    },
    header: {
      light: 'Hell',
      dark: 'Dunkel',
      systemLanguage: 'Systemsprache'
    },
    import: {
      title: 'Produkte importieren',
      subtitle: 'Importieren Sie Ihren Produktkatalog aus Excel oder JTL.',
      excelImport: 'Excel-Import',
      excelTab: 'Excel',
      selectExcel: 'Excel-Datei auswAhlen',
      dragText: 'Excel-Datei hierher ziehen',
      dragHint: 'Akzeptiert: .xlsx oder .xls',
      importBtn: 'Importieren',
      reset: 'ZurA?cksetzen',
      preview: 'Datenvorschau',
      jtlTab: 'JTL-Daten',
      jtlTitle: 'JTL-Import',
      jtlHint: 'Verwendet das aktive Datenbankprofil, um JTL-Daten zu laden.',
      importJtl: 'JTL-Daten laden',
      empty: 'Noch keine Daten importiert. Importieren Sie eine Datei fA?r die Vorschau.'
    },
    generate: {
      title: 'Titel generieren',
      subtitle: 'Die Ausgabe nutzt die aktuelle Systemsprache.',
      settings: 'Generierungseinstellungen',
      systemLanguage: 'Systemsprache',
      marketNotice: 'Marktplatz: eBay.de (Titel werden auf Deutsch erzeugt)',
      generateBtn: 'Titel generieren',
      preview: 'Vorschau',
      empty: 'Importieren Sie Produkte, um Vorschauen zu sehen.',
      tagVariations: '3 Varianten pro Produkt',
      tagLimit: '80-Zeichen-Limit',
      tagDuplicate: 'Duplikatsicher'
    },
    review: {
      title: 'Titel prüfen',
      subtitle: 'Generierte Titel prüfen und vor dem Export bearbeiten.',
      empty: 'Noch keine generierten Titel.',
      errorEmpty: 'Titel darf nicht leer sein',
      errorLength: 'Titel überschreitet 80 Zeichen',
      errorDuplicate: 'Doppelter Titel erkannt',
      saved: 'Titel aktualisiert'
    },
    export: {
      title: 'Titel exportieren',
      subtitle: 'Exportieren Sie Ihre finalen Titel nach Excel oder CSV.',
      excel: 'Excel-Export',
      excelBtn: 'Excel exportieren',
      csv: 'CSV-Export',
      csvBtn: 'CSV exportieren'
    },
    messages: {
      importSuccess: 'Import abgeschlossen',
      generateSuccess: 'Titel generiert',
      exportSuccess: 'Export abgeschlossen',
      missingSheetConfig: 'Credentials und Spreadsheet-ID angeben',
      missingExcel: 'Zuerst eine Excel-Datei auswählen',
      generationFailed: 'Generierung fehlgeschlagen',
      noTitlesExport: 'Keine generierten Titel zum Exportieren'
    },
    history: {
      title: 'Verlauf',
      subtitle: 'Protokoll von Importen, Generierungen und Exporten.',
      empty: 'Noch keine Verlaufseinträge.',
      action: 'Aktion',
      destination: 'Ziel',
      details: 'Details',
      date: 'Datum',
      itemNumber: 'Artikelnummer',
      sku: 'SKU',
      oldTitle: 'Alter Titel',
      newTitle: 'Neuer Titel',
      createdAt: 'Erstellt am'
    },
    logs: {
      title: 'Systemprotokolle',
      subtitle: 'Importe, Generierung, Preisupdates und Auslieferungen nachverfolgen.'
    },
    settings: {
      title: 'Einstellungen',
      subtitle: 'Standardsprache und UI-Einstellungen verwalten.',
      tabGeneral: 'Allgemein',
      tabDatabase: 'Datenbank',
      language: 'Sprache',
      appearance: 'Darstellung',
      lightTheme: 'Helles Design',
      marketNote: 'Titel werden für eBay.de (Deutsch) erzeugt.',
      dbTitle: 'Datenbankverbindungen',
      dbProfiles: 'Gespeicherte Profile',
      dbSelectProfile: 'Profil auswählen',
      dbActiveProfile: 'Aktives Profil',
      dbSetActive: 'Aktives Profil wählen',
      dbProfileName: 'Profilname',
      dbAuthentication: 'Authentifizierung',
      dbAuthSql: 'SQL-Authentifizierung',
      dbAuthWindows: 'Windows-Authentifizierung',
      dbServer: 'Servername',
      dbDatabase: 'Datenbankname',
      dbPort: 'Port',
      dbUser: 'Benutzer',
      dbPassword: 'Passwort',
      dbQuery: 'JTL-Import-Abfrage',
      dbNew: 'Neues Profil',
      dbTest: 'Verbindung testen',
      dbSave: 'Profil speichern',
      dbDelete: 'Profil löschen',
      dbHint: 'Die JTL-Import-Abfrage ist nur lesend (SELECT) und wird automatisch verwaltet.',
      dbTestSuccess: 'Datenbankverbindung erfolgreich',
      dbTestFailed: 'Datenbankverbindung fehlgeschlagen',
      dbSaveSuccess: 'Datenbankprofil gespeichert',
      dbSaveFailed: 'Speichern des Datenbankprofils fehlgeschlagen',
      dbDeleteSuccess: 'Datenbankprofil gelöscht',
      dbDeleteFailed: 'Löschen des Datenbankprofils fehlgeschlagen',
      dbAgentTitle: 'SQL-Server-Agent',
      dbAgentEnabled: 'Automatisch verbinden',
      dbAgentInterval: 'Wiederholungsintervall',
      dbAgentStatus: 'Status',
      dbAgentMessage: 'Meldung',
      dbAgentConnected: 'Verbunden',
      dbAgentDisconnected: 'Getrennt',
      dbAgentNoStatus: 'Noch kein Agent-Status',
      dbAgentRefresh: 'Jetzt verbinden',
      dbAgentUpdateFailed: 'SQL-Agent-Einstellungen konnten nicht aktualisiert werden'
    }
  }
};

export function getTranslator(lang) {
  const dict = translations[lang] || translations.en;
  return (path) => {
    const parts = path.split('.');
    let cur = dict;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return path;
      }
    }
    return cur;
  };
}
