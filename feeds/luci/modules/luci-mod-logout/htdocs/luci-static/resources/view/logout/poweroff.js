'use strict';
'use view';

return L.view.extend({
    render: function() {
        var hostname = (window.L && L.env && L.env.systemboard && L.env.systemboard.hostname) ? L.env.systemboard.hostname : '';
        L.ui.showModal(
            _('Do you want to shut down the system?') + (hostname ? ' (' + hostname + ')' : ''),
            [
                E('button', {
                    'class': 'cbi-button',
                    'click': function() { L.ui.hideModal(); }
                }, _('Cancel')),
                E('button', {
                    'class': 'cbi-button cbi-button-action',
                    'click': function() {
                        L.ui.showModal(_('Shutting down...'));
                        L.resolveDefault(L.request.post(L.url('admin/system/poweroff')), null)
                            .then(function() {
                                L.ui.showModal(_('Shutting down...'));
                            });
                    }
                }, _('Shut Down'))
            ]
        );
        return E('div');
    }
});
