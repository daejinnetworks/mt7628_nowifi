'use strict';
'require view';
'require dom';
'require form';
'require rpc';
'require fs';
'require ui';

var isReadonlyView = !L.hasViewPermission();

var callSystemValidateFirmwareImage = rpc.declare({
	object: 'system',
	method: 'validate_firmware_image',
	params: [ 'path' ],
	expect: { '': { valid: false, forcable: true } }
});

function findStorageSize(procmtd, procpart) {
	var kernsize = 0, rootsize = 0, wholesize = 0;

	procmtd.split(/\n/).forEach(function(ln) {
		var match = ln.match(/^mtd\d+: ([0-9a-f]+) [0-9a-f]+ "(.+)"$/),
		    size = match ? parseInt(match[1], 16) : 0;

		switch (match ? match[2] : '') {
		case 'linux':
		case 'firmware':
			if (size > wholesize)
				wholesize = size;
			break;

		case 'kernel':
		case 'kernel0':
			kernsize = size;
			break;

		case 'rootfs':
		case 'rootfs0':
		case 'ubi':
		case 'ubi0':
			rootsize = size;
			break;
		}
	});

	if (wholesize > 0)
		return wholesize;
	else if (kernsize > 0 && rootsize > kernsize)
		return kernsize + rootsize;

	procpart.split(/\n/).forEach(function(ln) {
		var match = ln.match(/^\s*\d+\s+\d+\s+(\d+)\s+(\S+)$/);
		if (match) {
			var size = parseInt(match[1], 10);

			if (!match[2].match(/\d/) && size > 2048 && wholesize == 0)
				wholesize = size * 1024;
		}
	});

	return wholesize;
}


var mapdata = { actions: {}, config: {} };

return view.extend({
	load: function() {
		var tasks = [
			L.resolveDefault(fs.stat('/lib/upgrade/platform.sh'), {}),
			fs.trimmed('/proc/sys/kernel/hostname'),
			fs.trimmed('/proc/mtd'),
			fs.trimmed('/proc/partitions'),
			fs.trimmed('/proc/mounts')
		];

		return Promise.all(tasks);
	},

	handleBackup: function(ev) {
		var form = E('form', {
			method: 'post',
			action: L.env.cgi_base + '/cgi-backup',
			enctype: 'application/x-www-form-urlencoded'
		}, E('input', { type: 'hidden', name: 'sessionid', value: rpc.getSessionID() }));

		ev.currentTarget.parentNode.appendChild(form);

		form.submit();
		form.parentNode.removeChild(form);
	},

	handleFirstboot: function(ev) {
		if (!confirm(_('Do you really want to erase all settings?')))
			return;

		ui.showModal(_('Erasing...'), [
			E('p', { 'class': 'spinning' }, _('The system is erasing the configuration partition now and will reboot itself when finished.'))
		]);

		/* Currently the sysupgrade rpc call will not return, hence no promise handling */
		fs.exec('/sbin/firstboot', [ '-r', '-y' ]);

		ui.awaitReconnect('192.168.1.1', 'openwrt.lan');
	},

	handleRestore: function(ev) {
		return ui.uploadFile('/tmp/backup.tar.gz', ev.target)
			.then(L.bind(function(btn, res) {
				btn.firstChild.data = _('Checking archive…');
				return fs.exec('/bin/tar', [ '-tzf', '/tmp/backup.tar.gz' ]);
			}, this, ev.target))
			.then(L.bind(function(btn, res) {
				if (res.code != 0) {
					ui.addNotification(null, E('p', _('The uploaded backup archive is not readable')));
					return fs.remove('/tmp/backup.tar.gz');
				}

				ui.showModal(_('Apply backup?'), [
					E('p', _('The uploaded backup archive appears to be valid and contains the files listed below. Press "Continue" to restore the backup and reboot, or "Cancel" to abort the operation.')),
					E('pre', {}, [ res.stdout ]),
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn',
							'click': ui.createHandlerFn(this, function(ev) {
								return fs.remove('/tmp/backup.tar.gz').finally(ui.hideModal);
							})
						}, [ _('Cancel') ]), ' ',
						E('button', {
							'class': 'btn cbi-button-action important',
							'click': ui.createHandlerFn(this, 'handleRestoreConfirm', btn)
						}, [ _('Continue') ])
					])
				]);
			}, this, ev.target))
			.catch(function(e) { ui.addNotification(null, E('p', e.message)) })
			.finally(L.bind(function(btn, input) {
				btn.firstChild.data = _('Upload archive...');
			}, this, ev.target));
	},

	handleRestoreConfirm: function(btn, ev) {
		return fs.exec('/sbin/sysupgrade', [ '--restore-backup', '/tmp/backup.tar.gz' ])
			.then(L.bind(function(btn, res) {
				if (res.code != 0) {
					ui.addNotification(null, [
						E('p', _('The restore command failed with code %d').format(res.code)),
						res.stderr ? E('pre', {}, [ res.stderr ]) : ''
					]);
					L.raise('Error', 'Unpack failed');
				}

				btn.firstChild.data = _('Rebooting…');
				return fs.exec('/sbin/reboot');
			}, this, ev.target))
			.then(L.bind(function(res) {
				if (res.code != 0) {
					ui.addNotification(null, E('p', _('The reboot command failed with code %d').format(res.code)));
					L.raise('Error', 'Reboot failed');
				}

				ui.showModal(_('Rebooting…'), [
					E('p', { 'class': 'spinning' }, _('The system is rebooting now. If the restored configuration changed the current LAN IP address, you might need to reconnect manually.'))
				]);

				ui.awaitReconnect(window.location.host, '192.168.1.1', 'openwrt.lan');
			}, this))
			.catch(function(e) { ui.addNotification(null, E('p', e.message)) })
			.finally(function() { btn.firstChild.data = _('Upload archive...') });
	},

	handleBackupList: function(ev) {
		return fs.exec('/sbin/sysupgrade', [ '--list-backup' ]).then(function(res) {
			if (res.code != 0) {
				ui.addNotification(null, [
					E('p', _('The sysupgrade command failed with code %d').format(res.code)),
					res.stderr ? E('pre', {}, [ res.stderr ]) : ''
				]);
				L.raise('Error', 'Sysupgrade failed');
			}

			ui.showModal(_('Backup file list'), [
				E('p', _('Below is the determined list of files to backup. It consists of changed configuration files marked by opkg, essential base files and the user defined backup patterns.')),
				E('ul', {}, (res.stdout || '').trim().split(/\n/).map(function(ln) { return E('li', {}, ln) })),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal
					}, [ _('Dismiss') ])
				])
			], 'cbi-modal');
		});
	},

	handleBackupSave: function(m, ev) {
		return m.save(function() {
			return fs.write('/etc/sysupgrade.conf', mapdata.config.editlist.trim().replace(/\r\n/g, '\n') + '\n');
		}).then(function() {
			ui.addNotification(null, E('p', _('Contents have been saved.')), 'info');
		}).catch(function(e) {
			ui.addNotification(null, E('p', _('Unable to save contents: %s').format(e)));
		});
	},

	render: function(rpc_replies) {
		var has_sysupgrade = (rpc_replies[0].type == 'file'),
		    hostname = rpc_replies[1],
		    procmtd = rpc_replies[2],
		    procpart = rpc_replies[3],
		    procmounts = rpc_replies[4],
		    has_rootfs_data = (procmtd.match(/"rootfs_data"/) != null) || (procmounts.match("overlayfs:\/overlay \/ ") != null),
		    storage_size = findStorageSize(procmtd, procpart),
		    m, s, o, ss;

		m = new form.JSONMap(mapdata, _('Flash operations'));
		m.tabbed = true;
		m.readonly = isReadonlyView;

		s = m.section(form.NamedSection, 'actions', _('Actions'));


		o = s.option(form.SectionValue, 'actions', form.NamedSection, 'actions', 'actions', _('Backup'), _('Click "Generate archive" to download a tar archive of the current configuration files.'));
		ss = o.subsection;

		o = ss.option(form.Button, 'dl_backup', _('Download backup'));
		o.inputstyle = 'action important';
		o.inputtitle = _('Generate archive');
		o.onclick = this.handleBackup;


		o = s.option(form.SectionValue, 'actions', form.NamedSection, 'actions', 'actions', _('Restore'), _('To restore configuration files, you can upload a previously generated backup archive here. To reset the firmware to its initial state, click "Perform reset" (only possible with squashfs images).'));
		ss = o.subsection;

		if (has_rootfs_data) {
			o = ss.option(form.Button, 'reset', _('Reset to defaults'));
			o.inputstyle = 'negative important';
			o.inputtitle = _('Perform reset');
			o.onclick = this.handleFirstboot;
		}

		o = ss.option(form.Button, 'restore', _('Restore backup'), _('Custom files (certificates, scripts) may remain on the system. To prevent this, perform a factory-reset first.'));
		o.inputstyle = 'action important';
		o.inputtitle = _('Upload archive...');
		o.onclick = L.bind(this.handleRestore, this);

		return m.render();
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
