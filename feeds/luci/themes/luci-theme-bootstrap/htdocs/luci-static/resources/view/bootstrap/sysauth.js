'use strict';
'require ui';
'require view';

return view.extend({
	render: function() {
		var form = document.querySelector('form'),
		    btn = document.querySelector('button');

		var dlg = ui.showModal(
			null,
			[].slice.call(document.querySelectorAll('section > *')),
			'login'
		);

		form.addEventListener('keypress', function(ev) {
			if (ev.key == 'Enter')
				btn.click();
		});

		btn.addEventListener('click', function() {
			dlg.querySelectorAll('*').forEach(function(node) { node.style.display = 'none' });

			var wrapper = E('div', { style: 'display: flex; align-items: center; justify-content: center; gap: 16px; height: 80px;' });
			var spinner = E('div', { 'class': 'color-spinning' });
			var text = E('span', {}, _('Logging in…'));
			wrapper.appendChild(spinner);
			wrapper.appendChild(text);
			dlg.appendChild(wrapper);

			form.submit()
		});

		document.querySelector('#luci_username').focus();

		return '';
	},

	addFooter: function() {}
});
