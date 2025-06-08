'use strict';
'require baseclass';
'require fs';
'require rpc';
'require uci';


var callPoweroffSystem = rpc.declare({
    object: 'luci',
    method: 'poweroffSystem'
});

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
                        callPoweroffSystem().then(function() {
                            L.ui.showModal(
                                E('div', { style: 'display: flex; align-items: center; gap: 10px;' }, [
                                    E('div', { class: 'color-spinning' }),
                                    E('span', {}, _('       Shutting down...'))
                                ])
                            );
                        });
                    }
                }, _('Shut Down'))
            ]
        );
        return E('div');
    }
});
