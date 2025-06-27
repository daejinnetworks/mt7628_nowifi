'use strict';
'require view';
'require fs';
'require uci';
'require form';
'require network';
'require tools.widgets as widgets';
'require tools.network as tn';

return view.extend({
	load: function() {
		return Promise.all([
			network.getDevices(),
			fs.lines('/etc/iproute2/rt_tables')
		]);
	},

	render: function(data) {
		var netDevs = data[0],
		    m, s, o;

		var rtTables = data[1].map(function(l) {
			var m = l.trim().match(/^(\d+)\s+(\S+)$/);
			return m ? [ +m[1], m[2] ] : null;
		}).filter(function(e) {
			return e && e[0] > 0;
		});

		m = new form.Map('network', _('Static Routing'), _('Routing defines over which interface and gateway a certain host or network can be reached.'));

		// IPv4 라우트만 처리 (탭 없이)
		s = m.section(form.GridSection, 'route', _('Static IPv4 Routes'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.cloneable = true;
		s.nodescriptions = true;
		
		// 모달 제목 커스터마이징
		s.addModalTitle = function(/* ... */) {
			return E('div', { 'style': 'text-align: center; margin-bottom: 20px;' }, [
				E('h3', { 'style': 'margin: 0; color: #333; font-size: 18px; font-weight: bold;' }, _('정적 라우팅 추가'))
			]);
		};
		
		// 모달 렌더링 오버라이드
		var originalRenderModal = s.renderModal || s.renderSectionModal;
		if (originalRenderModal) {
			s.renderModal = function(section_id, ev) {
				var modal = originalRenderModal.call(this, section_id, ev);
				if (modal && modal.firstElementChild) {
					var titleDiv = this.addModalTitle();
					modal.firstElementChild.insertBefore(titleDiv, modal.firstElementChild.firstChild);
				}
				return modal;
			};
		}

		// 네트워크 주소와 CIDR을 합친 커스텀 위젯
		o = s.option(form.Value, 'target', _('네트워크 주소'));
		o.rmempty = false;
		o.placeholder = '192.168.1.0/24';
		o.datatype = 'cidr4';
		o.cfgvalue = function(section_id) {
			var target = uci.get('network', section_id, 'target'),
			    mask = uci.get('network', section_id, 'netmask'),
			    bits = mask ? network.maskToPrefix(mask, false) : 24;
			if (target) {
				return target.split('/')[1] ? target : target + '/' + bits;
			}
		};
		o.write = function(section_id, formvalue) {
			uci.set('network', section_id, 'target', formvalue);
			uci.unset('network', section_id, 'netmask');
		};
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var value = (cfgvalue != null) ? cfgvalue : this.default;
			var parts = (value || '').split('/');
			var ip = parts[0] || '';
			var cidr = parts[1] || '24';
			var self = this;
			
			var updateValue = function() {
				var ipEl = document.getElementById(self.cbid(section_id) + '_ip');
				var cidrEl = document.getElementById(self.cbid(section_id) + '_cidr');
				if (ipEl && cidrEl) {
					var combinedValue = ipEl.value && cidrEl.value ? ipEl.value + '/' + cidrEl.value : '';
					var hiddenInput = document.getElementById(self.cbid(section_id));
					if (hiddenInput) {
						hiddenInput.value = combinedValue;
						hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
					}
				}
			};
			
			var container = E('div', { 'style': 'display: flex; align-items: center; gap: 8px; width: 100%;' }, [
				E('input', {
					'id': this.cbid(section_id) + '_ip',
					'class': 'cbi-input-text',
					'type': 'text',
					'placeholder': '192.168.1.0',
					'value': ip,
					'change': updateValue,
					'keyup': updateValue,
					'blur': updateValue
				}),
				E('span', { 'style': 'font-weight: bold; color: #666; margin: 0 4px;' }, '/'),
				E('input', {
					'id': this.cbid(section_id) + '_cidr',
					'class': 'cbi-input-text',
					'type': 'text',
					'placeholder': '24',
					'value': cidr,
					'style': 'width: 60px;',
					'change': updateValue,
					'keyup': updateValue,
					'blur': updateValue
				}),
				E('input', {
					'id': this.cbid(section_id),
					'type': 'hidden',
					'value': value || ''
				})
			]);
			
			return container;
		};
		o.formvalue = function(section_id) {
			var hiddenInput = document.getElementById(this.cbid(section_id));
			return hiddenInput ? hiddenInput.value : null;
		};

		// 게이트웨이 IP
		o = s.option(form.Value, 'gateway', _('게이트웨이 IP'));
		o.datatype = 'ip4addr("nomask")';
		o.placeholder = '192.168.1.1';

		// 메트릭
		o = s.option(form.Value, 'metric', _('메트릭'));
		o.datatype = 'uinteger';
		o.placeholder = '0';
		o.default = '0';

		// 인터페이스 (드롭다운)
		o = s.option(widgets.NetworkSelect, 'interface', _('인터페이스'));
		o.loopback = true;
		o.nocreate = true;
		o.rmempty = true;

		// 주석
		o = s.option(form.Value, 'comment', _('주석'));
		o.rmempty = true;
		o.placeholder = _('Enter description...');

		return m.render();
	}
});
