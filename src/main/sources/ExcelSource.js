import ExcelImporter from '../importers/ExcelImporter.js';
import DatabaseSource from './DatabaseSource.js';

export default class ExcelSource {
  static async importIntoSession(filePath, sessionId) {
    if (!filePath) {
      throw new Error('No file path provided');
    }
    return ExcelImporter.importFile(filePath, sessionId);
  }

  static getSessionProductsNormalized(sessionId) {
    return DatabaseSource.getSessionProductsNormalized(sessionId);
  }
}
