import templates from '../languages/templates.js';

export default class TemplateEngine {
  static render(template, data) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      return data[key] || '';
    });
  }

  static buildTemplates(category, languageData) {
    const list = templates[category] || templates.general;
    return list.map((tpl) =>
      TemplateEngine.render(tpl, {
        compatible: languageData.compatible,
        toner: languageData.toner,
        ink: languageData.ink,
        drum: languageData.drum
      })
    );
  }
}
