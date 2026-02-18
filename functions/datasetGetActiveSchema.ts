import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active dataset
    const activeDatasets = await base44.entities.Dataset.filter({ status: 'active' });
    
    if (activeDatasets.length === 0) {
      return Response.json({
        hasActiveDataset: false,
        customFields: []
      });
    }

    const dataset = activeDatasets[0];

    return Response.json({
      hasActiveDataset: true,
      datasetId: dataset.id,
      datasetName: dataset.name,
      customFields: dataset.custom_fields || [],
      totalRecords: dataset.total_records || 0
    });

  } catch (error) {
    console.error('Schema fetch error:', error);
    return Response.json({ 
      error: error.message || 'Failed to fetch schema'
    }, { status: 500 });
  }
});