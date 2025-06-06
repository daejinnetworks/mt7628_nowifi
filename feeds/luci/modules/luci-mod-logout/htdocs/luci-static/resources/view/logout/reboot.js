'use strict';
'use view';

return L.view.extend({
    render: function() {
        var hostname = (window.L && L.env && L.env.systemboard && L.env.systemboard.hostname) ? L.env.systemboard.hostname : '';
        L.ui.showModal(
            _('Do you want to reboot the system?') + (hostname ? ' (' + hostname + ')' : ''),
            [
                E('button', {
                    'class': 'cbi-button',
                    'click': function() { L.ui.hideModal(); }
                }, _('Cancel')),
                E('button', {
                    'class': 'cbi-button cbi-button-action',
                    'click': function() {
                        L.ui.showModal(
                            E('div', { style: 'display: flex; align-items: center; gap: 10px;' }, [
                                E('div', { class: 'color-spinning' }),
                                E('span', {}, _('Rebooting...'))
                            ])
                        );
                        L.resolveDefault(L.request.post(L.url('admin/system/reboot')), null)
                            .then(function() {
                                L.ui.showModal(_('Rebooting...'));
                            });
                    }
                }, _('Reboot'))
            ]
        );
        return E('div');
    }
});
