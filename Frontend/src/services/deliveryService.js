import api from './api';

const deliveryService = {
  /**
   * @param {'active'|'done'} scope
   */
  getQueue: async (scope = 'active') => {
    const params = new URLSearchParams();
    if (scope) params.set('scope', scope);
    const q = params.toString();
    return api.get(q ? `/deliveries/queue?${q}` : '/deliveries/queue');
  },

  /**
   * @param {Array<{ entityType: 'job'|'sale'|'rental', id: string, deliveryStatus: string|null, deliveryLeg?: 'pickup'|'return' }>} updates
   */
  patchStatuses: async (updates) => {
    return api.patch('/deliveries/status', { updates });
  }
};

export default deliveryService;
