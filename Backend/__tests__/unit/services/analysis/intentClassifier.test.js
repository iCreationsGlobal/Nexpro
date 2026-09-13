const { classifyIntent, isAnalysisIntent } = require('../../../../services/analysis/intentClassifier');

describe('intentClassifier', () => {
  it('classifies sales today', () => {
    const r = classifyIntent("How much did I sell today?");
    expect(r.route).toBe('analysis');
    expect(r.intent).toBe('sales_today');
    expect(isAnalysisIntent(r.intent)).toBe(true);
  });

  it('classifies sales this month', () => {
    const r = classifyIntent('How are sales this month?');
    expect(r.intent).toBe('sales_this_month');
    expect(r.route).toBe('analysis');
  });

  it('classifies compare vs prior period', () => {
    const r = classifyIntent('Compare this period to the previous period');
    expect(r.intent).toBe('sales_vs_prior_period');
  });

  it('classifies compare this quarter to last quarter', () => {
    expect(classifyIntent('Compare this quarter to last quarter').intent).toBe(
      'sales_vs_prior_period'
    );
  });

  it('classifies why sales down before generic sales', () => {
    const r = classifyIntent('Why are sales down?');
    expect(r.intent).toBe('why_sales_down');
  });

  it('classifies top products', () => {
    expect(classifyIntent('What are my top products?').intent).toBe('top_products');
  });

  it('classifies best sellers plural as top_products', () => {
    expect(classifyIntent('Best sellers this month').intent).toBe('top_products');
    expect(classifyIntent('What are my best sellers?').intent).toBe('top_products');
  });

  it('does not route top expenses to top_products', () => {
    const r = classifyIntent('What are my top expenses?');
    expect(r.intent).toBe('expenses_by_category');
    expect(r.route).toBe('analysis');
  });

  it('classifies expense categories', () => {
    expect(classifyIntent('What are my top expense categories?').intent).toBe(
      'expenses_by_category'
    );
  });

  it('routes profit questions to analysis not advisory', () => {
    const r = classifyIntent('How much profit did I make this month?');
    expect(r.route).toBe('analysis');
    expect(r.intent).toBe('sales_this_month');
  });

  it('routes profit today to sales_today', () => {
    expect(classifyIntent("What's my profit today?").intent).toBe('sales_today');
  });

  it('routes predict next month revenue to advisory not sales', () => {
    const r = classifyIntent("Predict next month's revenue");
    expect(r.route).toBe('advisory');
    expect(r.intent).toBe('business_advisory');
  });

  it('classifies inactive customers', () => {
    expect(
      classifyIntent("Show me customers who haven't ordered in 30 days").intent
    ).toBe('inactive_customers');
  });

  it('classifies new customers', () => {
    expect(classifyIntent('How many new customers this month?').intent).toBe(
      'new_customers'
    );
  });

  it('classifies job pipeline as analysis', () => {
    expect(classifyIntent('Summarize my open jobs').intent).toBe('job_pipeline');
    expect(classifyIntent('Which jobs still need attention?').intent).toBe(
      'job_pipeline'
    );
  });

  it('classifies rental operational questions as analysis', () => {
    expect(classifyIntent('What rentals are due back today?').intent).toBe('rentals_due_today');
    expect(classifyIntent('Show overdue rentals').intent).toBe('rentals_overdue');
    expect(classifyIntent('Which items have the most damage?').intent).toBe('rental_damage');
    expect(classifyIntent('Rental revenue this month').intent).toBe('rental_revenue_month');
  });

  it('classifies meals sold best as top_products', () => {
    expect(classifyIntent('What meals sold best today?').intent).toBe('top_products');
  });

  it('classifies who owes me', () => {
    expect(classifyIntent('Who owes me money?').intent).toBe('who_owes_me');
  });

  it('classifies low stock / restock', () => {
    expect(classifyIntent('What should I restock?').intent).toBe('low_stock');
  });

  it('classifies performance summary', () => {
    expect(classifyIntent('Summarize performance').intent).toBe('performance_summary');
  });

  it('classifies what to work on based on sales as performance summary', () => {
    const r = classifyIntent(
      'What do I need to work on in my business based on this yearr sales'
    );
    expect(r.route).toBe('analysis');
    expect(r.intent).toBe('performance_summary');
  });

  it('classifies this quarter sales via selected-period analysis', () => {
    const r = classifyIntent('How much did I sell this quarter?');
    expect(r.route).toBe('analysis');
    expect(r.intent).toBe('sales_this_month');
  });

  it('classifies yesterday sales as period sales analysis', () => {
    expect(classifyIntent('How much did I sell yesterday?').intent).toBe(
      'sales_this_month'
    );
  });

  it('routes how-to to support', () => {
    const r = classifyIntent('How do I create an invoice?');
    expect(r.route).toBe('support');
  });

  it('routes draft requests to draft', () => {
    const r = classifyIntent('Draft a polite payment reminder for overdue customers');
    expect(r.route).toBe('draft');
  });

  it('routes growth advice to advisory', () => {
    const r = classifyIntent('How do I get more customers?');
    expect(r.route).toBe('advisory');
    expect(r.intent).toBe('business_advisory');
  });

  it('routes marketing strategy to advisory', () => {
    expect(classifyIntent('Give me marketing tips for my shop').route).toBe('advisory');
  });

  it('routes predictions to advisory', () => {
    const r = classifyIntent('Will I sell more next week?');
    expect(r.route).toBe('advisory');
    expect(r.suggestedQuestions?.length).toBeGreaterThan(0);
  });

  it('routes unknown open questions to advisory with suggestions', () => {
    const r = classifyIntent('What is the meaning of inventory turnover for a boutique?');
    expect(r.route).toBe('advisory');
    expect(r.suggestedQuestions?.length).toBeGreaterThan(0);
  });

  it('keeps empty message unsupported', () => {
    const r = classifyIntent('   ');
    expect(r.route).toBe('unsupported');
  });

  it('routes bare greetings to advisory (chat uses smallTalk separately)', () => {
    const r = classifyIntent('hello');
    expect(r.route).toBe('advisory');
    expect(r.suggestedQuestions?.length).toBeGreaterThan(0);
  });
});
