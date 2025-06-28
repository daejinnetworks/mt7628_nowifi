// Policy Based Routing - Custom Interface (pbr1.png design)
// Copyright 2024 - Based on PBR by Stan Grishin

"use strict";
"require form";
"require rpc";
"require view";
"require pbr.status as pbr";
"require ui";
"require dom";

var pkg = pbr.pkg;


var getRoutingInfo = rpc.declare({
	object: "luci." + pkg.Name,
	method: "getRoutingInfo", 
	params: ["name"],
});

return view.extend({
	load: function () {
		return Promise.all([
			L.resolveDefault(pbr.getInterfaces(pkg.Name), {}),
			L.resolveDefault(pbr.getPlatformSupport(pkg.Name), {}),
			L.resolveDefault(L.uci.load(pkg.Name), {}),
		]);
	},

	render: function (data) {
		var m, s, o;
		var reply = {
			interfaces: (data[0] && data[0][pkg.Name] && data[0][pkg.Name].interfaces) || ["LAN"],
			platform: (data[1] && data[1][pkg.Name]) || {},
		};

		// Use standard LuCI Map approach
		m = new form.Map(pkg.Name, _('정책 기반 라우팅'), 
			_('네트워크 연결을 정책에 따라 다른 경로로 라우팅하여 특정 서비스나 주소에 대한 우회 경로를 설정할 수 있습니다.')
		);

		// Main Tabbed Section
		s = m.section(form.NamedSection, "config", pkg.Name, _('상태 및 설정'));
		s.tab('settings', _('설정'));
		s.tab('priority', _('라우팅 테이블'));
		
		// 탭 스타일 - 동일한 크기로 설정 (절반 크기)
		var style = document.createElement('style');
		style.textContent = `
			.cbi-tabmenu li {
				width: 100px !important;
				text-align: center !important;
				display: inline-block !important;
			}
		`;
		document.head.appendChild(style);

		// Settings Tab Content - Service Configuration  
		var serviceConfig = s.taboption('settings', form.DummyValue, '__service_config__', _('서비스'));
		serviceConfig.render = function() {
			// 현재 UCI 설정에서 enabled 값 읽기
			var currentEnabled = L.uci.get('pbr', 'config', 'enabled') === '1';
			
			var checkbox = E('input', { 
				'type': 'checkbox',
				'id': 'service_enabled_checkbox',
				'style': 'margin: 0;',
				'checked': currentEnabled,
				'change': function() {
					L.uci.set('pbr', 'config', 'enabled', this.checked ? '1' : '0');
					L.uci.save().then(function() {
						ui.addNotification(null, E('p', _('서비스 설정이 변경되었습니다.')), 'info');
					}).catch(function(err) {
						ui.addNotification(null, E('p', _('저장 실패: ') + err.message), 'error');
					});
				}
			});
			
			return E('div', { 'style': 'display: flex; align-items: center; margin-bottom: 15px;' }, [
				E('strong', { 'style': 'margin-right: 15px; min-width: 80px; font-size: 16px;' }, _('서비스')),
				E('label', { 'style': 'margin-right: 10px;' }, _('서비스 활성화')),
				checkbox
			]);
		};

		// Settings Tab에서만 정책 테이블 라벨 표시 - 서비스와 동일한 스타일
		var policyLabel = s.taboption('settings', form.DummyValue, '__policy_label__', '');
		policyLabel.render = function() {
			return E('div', { 'style': 'display: flex; align-items: center; margin-bottom: 15px;' }, [
				E('strong', { 'style': 'margin-right: 10px; min-width: 80px;' }, _('라우팅 정책 규칙'))
			]);
		};
		
		// Settings Tab에서만 정책 테이블 표시 - taboption + renderWidget 방식
		s.taboption('settings', form.DummyValue, '_policy_table', '').renderWidget = function(section_id, option_id, cfgvalue) {
			// UCI에서 policy 섹션들 읽기 (load 함수에서 이미 로드됨)
			var policies;
			try {
				policies = L.uci.sections('pbr', 'policy') || [];
			} catch (e) {
				console.warn('UCI 데이터 로딩 중 오류:', e);
				policies = [];
			}
			
			// 테이블 헤더
			var tableRows = [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('활성화')),
					E('th', { 'class': 'th' }, _('정책명')),
					E('th', { 'class': 'th' }, _('네트워크 서비스')),
					E('th', { 'class': 'th' }, _('원본 포트')),
					E('th', { 'class': 'th' }, _('목적지')),
					E('th', { 'class': 'th' }, _('목적지 포트')),
					E('th', { 'class': 'th' }, _('프로토콜')),
					E('th', { 'class': 'th' }, _('체인')),
					E('th', { 'class': 'th' }, _('인터페이스')),
					E('th', { 'class': 'th cbi-section-actions' }, _(''))
				])
			];
			
			// 각 정책별로 행 생성 - 클로저 변수 문제 해결
			policies.forEach(function(policy, index) {
				// 클로저 문제 해결을 위해 즉시 실행 함수로 감싸기
				(function(currentPolicy) {
					tableRows.push(
						E('tr', { 'class': 'tr' }, [
							// 활성화 체크박스
							E('td', { 'class': 'td' }, [
								E('input', {
									'type': 'checkbox',
									'checked': currentPolicy.enabled === '1',
									'data-policy-id': currentPolicy['.name'],
									'change': function() {
										var self = this;
										var policyId = currentPolicy['.name'];
										L.uci.set('pbr', policyId, 'enabled', this.checked ? '1' : '0');
										L.uci.save().then(function() {
											ui.addNotification(null, E('p', _('정책 상태가 변경되었습니다.')), 'info');
										}).catch(function(err) {
											// 저장 실패 시 체크박스 상태 되돌리기
											self.checked = !self.checked;
											ui.addNotification(null, E('p', _('저장 실패: ') + err.message), 'error');
										});
									}
								})
							]),
							// 정책명
							E('td', { 'class': 'td' }, currentPolicy.name || _('없음')),
							// 네트워크 서비스 (src_addr)
							E('td', { 'class': 'td' }, currentPolicy.src_addr || _('없음')),
							// 원본 포트 (src_port)
							E('td', { 'class': 'td' }, currentPolicy.src_port || _('없음')),
							// 목적지 (dest_addr)
							E('td', { 'class': 'td' }, currentPolicy.dest_addr || _('없음')),
							// 목적지 포트 (dest_port)
							E('td', { 'class': 'td' }, currentPolicy.dest_port || _('없음')),
							// 프로토콜
							E('td', { 'class': 'td' }, currentPolicy.proto || _('없음')),
							// 체인
							E('td', { 'class': 'td' }, currentPolicy.chain || _('없음')),
							// 인터페이스
							E('td', { 'class': 'td' }, currentPolicy.interface || _('없음')),
							// 액션 버튼들
							E('td', { 'class': 'td cbi-section-actions' }, [
								E('div', { 'style': 'display: flex; gap: 5px; align-items: center;' }, [
									// Edit button
									E('button', {
										'class': 'btn cbi-button cbi-button-edit',
										'title': _('수정'),
										'style': 'padding: 2px 8px; font-size: 12px;',
										'click': function() {
											editPolicy(currentPolicy['.name']);
										}
									}, _('수정')),
									
									// Delete button
									E('button', {
										'class': 'btn cbi-button cbi-button-remove',
										'title': _('삭제'),
										'style': 'padding: 2px 8px; font-size: 12px;',
										'click': function() {
											if (confirm(_('정말로 이 정책을 삭제하시겠습니까?'))) {
												L.uci.remove('pbr', currentPolicy['.name']);
												L.uci.save().then(function() {
													location.reload();
												}).catch(function(err) {
													ui.addNotification(null, E('p', _('삭제 실패: ') + err.message), 'error');
												});
											}
										}
									}, _('삭제'))
								])
							])
						])
					);
				})(policy);
			});
			
			// 빈 상태 메시지
			if (policies.length === 0) {
				tableRows.push(
					E('tr', { 'class': 'tr placeholder' }, [
						E('td', { 'class': 'td', 'colspan': 10 }, _('정책이 없습니다. 추가 버튼을 눌러 새 정책을 생성하세요.'))
					])
				);
			}
			
			return E('div', { 'class': 'table-wrapper', 'style': 'margin-left: 0; width: 100%;' }, [
				// 테이블 - 왼쪽 여백 없이 꽉차게
				E('table', { 'class': 'table cbi-section-table', 'style': 'width: 100%; margin-left: 0;' }, [
					E('tbody', {}, tableRows)
				]),
				// 추가 버튼 - 표 아래로 이동
				E('div', { 'class': 'cbi-section-create', 'style': 'margin-top: 10px; text-align: left;' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-add',
						'click': function() {
							showPolicyModal(m, reply);
						}
					}, _('추가'))
				])
			]);
		};

		// Priority Tab Content - Status Information only
		s.taboption('priority', form.DummyValue, '__status_info__', _('Netbox의 라우팅 테이블 정보 (PRE > MAIN > POST > END)'));
		var statusOpt = s.taboption('priority', form.DummyValue, '__routing_display__');
		statusOpt.render = function() {
			return E('div', { 
				'id': 'pbr-status-content',
				'style': 'border: 1px solid #ccc; padding: 15px; border-radius: 5px; background: #f9f9f9; margin-top: 10px;'
			}, [
				E('div', { 'class': 'alert alert-info' }, [
					E('strong', {}, _('라우팅 테이블 상태')),
					E('p', { 'style': 'margin: 10px 0 0 0;' }, 
						_('현재 시스템의 라우팅 테이블과 정책 상태가 여기에 실시간으로 표시됩니다.')
					)
				]),
				E('div', { 'id': 'routing-tables-info' }, [
					E('h4', {}, _('활성 라우팅 테이블')),
					E('pre', { 'id': 'route-table-display', 'style': 'background: white; padding: 10px; border: 1px solid #ddd; font-size: 12px;' },
						_('로딩 중...')
					)
				])
			]);
		};
		
		// 우선순위 탭에서 저장&적용 버튼들 숨기기
		setTimeout(function() {
			var tabButtons = document.querySelectorAll('.cbi-tabmenu li');
			tabButtons.forEach(function(tab) {
				tab.addEventListener('click', function() {
					var tabName = this.getAttribute('data-tab') || this.textContent.trim();
					
					// 우선순위 탭에서 저장&적용 버튼들 숨기기
					var submitButtons = document.querySelector('.cbi-page-actions');
					if (submitButtons) {
						if (tabName === '라우팅 테이블' || this.classList.contains('cbi-tab-priority')) {
							submitButtons.style.display = 'none';
						} else {
							submitButtons.style.display = 'block';
						}
					}
				});
			});
			
			// 기본적으로 우선순위 탭에서는 저장 버튼들 숨기기
			var activeTab = document.querySelector('.cbi-tabmenu .cbi-tab.cbi-tab-active');
			if (activeTab && (activeTab.textContent.trim() === '라우팅 테이블' || activeTab.classList.contains('cbi-tab-priority'))) {
				var submitButtons = document.querySelector('.cbi-page-actions');
				if (submitButtons) {
					submitButtons.style.display = 'none';
				}
			}
		}, 100);

		// Load routing table information after render using PBR RPC
		setTimeout(function() {
			var displayElement = document.getElementById('route-table-display');
			if (displayElement) {
				L.resolveDefault(getRoutingInfo(pkg.Name), {})
				.then(function(result) {
					if (result && result.stdout) {
						displayElement.textContent = result.stdout;
					} else if (result && result.error) {
						displayElement.textContent = _('오류: ') + result.error;
					} else {
						displayElement.textContent = _('라우팅 정보를 가져올 수 없습니다.');
					}
				}).catch(function(err) {
					displayElement.textContent = _('오류: ') + err.message;
				});
			}
		}, 100);

		return m.render();
	},

});

// 정책 수정 함수
function editPolicy(policyId) {
	var policies = L.uci.sections('pbr', 'policy') || [];
	var policy = policies.find(function(p) { return p['.name'] === policyId; });
	
	if (!policy) {
		ui.addNotification(null, E('p', _('정책을 찾을 수 없습니다.')), 'error');
		return;
	}
	
	// 인터페이스 정보를 가져온 후 모달 열기
	L.resolveDefault(pbr.getInterfaces(pkg.Name), {}).then(function(interfaceData) {
		var interfaces = (interfaceData && interfaceData[pkg.Name] && interfaceData[pkg.Name].interfaces) || ["LAN"];
		var reply = { interfaces: interfaces };
		showPolicyModal(null, reply, policy);
	}).catch(function(err) {
		// 인터페이스 정보를 가져올 수 없는 경우 기본값 사용
		console.warn('인터페이스 정보 로딩 실패:', err);
		var reply = { interfaces: ["LAN", "VPN"] };
		showPolicyModal(null, reply, policy);
	});
}

// 정책 추가/수정 모달창 함수 (pbr7.png 디자인 기반)
function showPolicyModal(parentMap, reply, existingPolicy) {
	var isEdit = !!existingPolicy;
	// 모달 너비 확장을 위한 스타일 추가
	var modalStyle = document.createElement('style');
	modalStyle.textContent = `
		.modal-wide .modal-dialog {
			max-width: 800px !important;
			width: 90% !important;
		}
		.cbi-row {
			display: flex;
			flex-wrap: wrap;
			gap: 20px;
			margin-bottom: 15px;
		}
		.cbi-col {
			flex: 1;
			min-width: 200px;
		}
		.cbi-col-2 {
			flex: 2;
		}
		.cbi-col-3 {
			flex: 3;
		}
	`;
	document.head.appendChild(modalStyle);
	
	var modalForm = E('div', { 'class': 'cbi-modal modal-wide' }, [
		// 첫 번째 줄: 정책명과 사용 여부
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('정책명')),
				E('input', { 
					'type': 'text',
					'id': 'modal_policy_name',
					'class': 'cbi-input-text',
					'placeholder': '정책명을 입력하세요',
					'style': 'width: 100%; margin-top: 5px;'
				})
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('사용 여부')),
				E('div', { 'class': 'cbi-value-field', 'style': 'display: flex; align-items: center; margin-top: 5px;' }, [
					E('input', { 
						'type': 'checkbox',
						'id': 'modal_service_enabled',
						'checked': true,
						'style': 'margin: 0; vertical-align: middle;'
					}),
					E('span', {}, ' '),
					E('label', { 'for': 'modal_service_enabled', 'style': 'margin: 0; vertical-align: middle;' }, _('사용'))
				])
			])
		]),
		
		// 두 번째 줄: 순위, 입력, 적용대상
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('순위')),
				E('input', { 
					'type': 'number',
					'id': 'modal_priority',
					'class': 'cbi-input-text',
					'placeholder': '1',
					'style': 'width: 100%; margin-top: 5px;'
				})
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('입력')),
				E('select', { 'id': 'modal_input_device', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': 'any' }, _('ANY')),
					E('option', { 'value': 'LAN' }, 'LAN'),
					E('option', { 'value': 'VPN' }, 'VPN')
				])
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('적용대상')),
				E('select', { 'id': 'modal_target_type', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': 'forward' }, _('전달 패킷')),
					E('option', { 'value': 'output' }, _('자체 발생 패킷')),
					E('option', { 'value': 'both' }, _('둘다'))
				])
			])
		]),
		
		// 세 번째 줄: 라우팅 테이블 위치
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('라우팅 테이블 위치')),
				E('select', { 'id': 'modal_chain', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': 'PRE' }, 'PRE'),
					E('option', { 'value': 'POST' }, 'POST')
				])
			])
		]),
		
		// 네 번째 줄: 프로토콜
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('프로토콜')),
				E('select', { 'id': 'modal_protocol', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': 'ANY' }, 'ANY'),
					E('option', { 'value': 'tcp' }, 'tcp'),
					E('option', { 'value': 'udp' }, 'udp'),
					E('option', { 'value': 'icmp' }, 'icmp'),
					E('option', { 'value': 'esp' }, 'esp'),
					E('option', { 'value': 'ah' }, 'ah'),
					E('option', { 'value': 'gre' }, 'gre'),
					E('option', { 'value': 'ipip' }, 'ipip'),
					E('option', { 'value': 'sctp' }, 'sctp')
				])
			])
		]),
		
		// 다섯째 줄: 출발지 설정
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('출발지 타입')),
				E('select', { 'id': 'modal_src_type', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': 'AH' }, 'AH'),
					E('option', { 'value': '기타' }, '기타')
				])
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('출발지 IP 주소')),
				E('input', { 
					'type': 'text',
					'id': 'modal_src_addr',
					'class': 'cbi-input-text',
					'placeholder': '192.168.1.0/24',
					'style': 'width: 100%; margin-top: 5px;'
				})
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('출발지 네트마스크')),
				E('input', { 
					'type': 'text',
					'id': 'modal_netmask',
					'class': 'cbi-input-text',
					'style': 'width: 100%; margin-top: 5px;'
				})
			])
		]),
		
		// 여섯째 줄: 출발지 포트 설정
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('출발지 포트 타입')),
				E('select', { 'id': 'modal_port_type', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': 'ANY' }, 'ANY')
				])
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('출발지 포트 범위')),
				E('div', { 'style': 'margin-top: 5px;' }, [
					E('input', { 
						'type': 'text',
						'id': 'modal_src_port_start',
						'class': 'cbi-input-text',
						'style': 'width: 80px; display: inline-block;',
						'placeholder': '시작'
					}),
					E('span', { 'style': 'margin: 0 10px;' }, ' ~ '),
					E('input', { 
						'type': 'text',
						'id': 'modal_src_port_end',
						'class': 'cbi-input-text',
						'style': 'width: 80px; display: inline-block;',
						'placeholder': '끝'
					})
				])
			])
		]),
		
		// 일곱째 줄: 목적지 설정
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('목적지 사용 여부')),
				E('div', { 'style': 'margin-top: 5px;' }, [
					E('input', { 
						'type': 'checkbox',
						'id': 'modal_dest_enabled'
					}),
					E('span', {}, ' '),
					E('label', { 'for': 'modal_dest_enabled' }, _('목적지 설정 사용'))
				])
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('목적지 IP 타입')),
				E('select', { 'id': 'modal_dest_ip_type', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': '직접입력(데이터)' }, _('직접입력(데이터)')),
					E('option', { 'value': 'ANY' }, 'ANY'),
					E('option', { 'value': '직접입력' }, _('직접입력')),
					E('option', { 'value': '직접입력(네트스크)' }, _('직접입력(네트스크)')),
					E('option', { 'value': '초기화IP그룹' }, _('초기화IP그룹'))
				])
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('목적지 IP 주소')),
				E('input', { 
					'type': 'text',
					'id': 'modal_dest_addr',
					'class': 'cbi-input-text',
					'style': 'width: 100%; margin-top: 5px;'
				})
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('목적지 네트마스크')),
				E('input', { 
					'type': 'text',
					'id': 'modal_dest_netmask',
					'class': 'cbi-input-text',
					'style': 'width: 100%; margin-top: 5px;'
				})
			])
		]),
		
		// 여덟째 줄: 목적지 포트 및 인터페이스 설정
		E('div', { 'class': 'cbi-row' }, [
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('목적지 포트 타입')),
				E('select', { 'id': 'modal_dest_port_type', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, [
					E('option', { 'value': 'ANY' }, 'ANY'),
					E('option', { 'value': '직접입력' }, _('직접입력')),
					E('option', { 'value': 'IKE' }, 'IKE'),
					E('option', { 'value': 'Secured' }, 'Secured'),
					E('option', { 'value': 'Mgmt_TCP' }, 'Mgmt_TCP'),
					E('option', { 'value': 'Mgmt_UDP' }, 'Mgmt_UDP')
				])
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('목적지 포트 범위')),
				E('div', { 'style': 'margin-top: 5px;' }, [
					E('input', { 
						'type': 'text',
						'id': 'modal_dest_port_start',
						'class': 'cbi-input-text',
						'style': 'width: 80px; display: inline-block;',
						'placeholder': '시작'
					}),
					E('span', { 'style': 'margin: 0 10px;' }, ' ~ '),
					E('input', { 
						'type': 'text',
						'id': 'modal_dest_port_end',
						'class': 'cbi-input-text',
						'style': 'width: 80px; display: inline-block;',
						'placeholder': '끝'
					})
				])
			]),
			E('div', { 'class': 'cbi-col' }, [
				E('label', { 'class': 'cbi-value-title' }, _('라우팅 인터페이스')),
				E('select', { 'id': 'modal_interface', 'class': 'cbi-input-select', 'style': 'width: 100%; margin-top: 5px;' }, (function() {
					var options = [];
					// reply.interfaces에서 시스템 인터페이스 추가
					if (reply && reply.interfaces) {
						reply.interfaces.forEach(function(iface) {
							if (iface !== 'ignore') {
								options.push(E('option', { 'value': iface }, iface));
							}
						});
					}
					// 기본 인터페이스 옵션들 추가
					var defaultInterfaces = ['LAN', 'VPN', 'ignore'];
					defaultInterfaces.forEach(function(iface) {
						if (!reply.interfaces || reply.interfaces.indexOf(iface) === -1) {
							options.push(E('option', { 'value': iface }, iface));
						}
					});
					return options;
				})())
			])
		])
	]);
	
	var modalButtons = E('div', { 'class': 'right' }, [
		E('button', {
			'class': 'btn cbi-button-neutral',
			'click': function() {
				ui.hideModal();
			}
		}, _('취소')),
		E('span', {}, ' '),
		E('button', {
			'class': 'btn cbi-button-positive',
			'click': function() {
				if (isEdit) {
					updatePolicy(existingPolicy['.name']);
				} else {
					addNewPolicy();
				}
				ui.hideModal();
			}
		}, _('확인'))
	]);
	
	var modalTitle = isEdit ? _('정책 수정') : _('고급정책 추가');
	ui.showModal(modalTitle, [modalForm, modalButtons]);
	
	// 수정 모드인 경우 기존 데이터로 폼 필드 채우기
	if (isEdit && existingPolicy) {
		setTimeout(function() {
			// 기본 정보 - 정책명 추가
			if (document.getElementById('modal_policy_name')) {
				document.getElementById('modal_policy_name').value = existingPolicy.name || '';
			}
			if (document.getElementById('modal_service_enabled')) {
				document.getElementById('modal_service_enabled').checked = existingPolicy.enabled === '1';
			}
			if (document.getElementById('modal_priority')) {
				document.getElementById('modal_priority').value = existingPolicy.priority || '';
			}
			if (document.getElementById('modal_input_device')) {
				document.getElementById('modal_input_device').value = existingPolicy.input_device || 'any';
			}
			if (document.getElementById('modal_target_type')) {
				document.getElementById('modal_target_type').value = existingPolicy.target_type || 'forward';
			}
			if (document.getElementById('modal_chain')) {
				document.getElementById('modal_chain').value = existingPolicy.chain || 'PRE';
			}
			if (document.getElementById('modal_protocol')) {
				document.getElementById('modal_protocol').value = existingPolicy.proto || 'ANY';
			}
			
			// 출발지 관련 새 필드들
			if (document.getElementById('modal_src_type')) {
				document.getElementById('modal_src_type').value = existingPolicy.src_type || 'AH';
			}
			if (document.getElementById('modal_src_addr')) {
				document.getElementById('modal_src_addr').value = existingPolicy.src_addr || '';
			}
			if (document.getElementById('modal_netmask')) {
				document.getElementById('modal_netmask').value = existingPolicy.src_netmask || '';
			}
			if (document.getElementById('modal_port_type')) {
				document.getElementById('modal_port_type').value = existingPolicy.src_port_type || 'ANY';
			}
			
			// 목적지 관련 새 필드들
			if (document.getElementById('modal_dest_enabled')) {
				document.getElementById('modal_dest_enabled').checked = existingPolicy.dest_enabled === '1';
			}
			if (document.getElementById('modal_dest_ip_type')) {
				document.getElementById('modal_dest_ip_type').value = existingPolicy.dest_ip_type || 'ANY';
			}
			if (document.getElementById('modal_dest_addr')) {
				document.getElementById('modal_dest_addr').value = existingPolicy.dest_addr || '';
			}
			if (document.getElementById('modal_dest_netmask')) {
				document.getElementById('modal_dest_netmask').value = existingPolicy.dest_netmask || '';
			}
			if (document.getElementById('modal_dest_port_type')) {
				document.getElementById('modal_dest_port_type').value = existingPolicy.dest_port_type || 'ANY';
			}
			
			// 포트 범위 파싱 로직 수정
			if (existingPolicy.src_port && document.getElementById('modal_src_port_start')) {
				var srcPortValue = existingPolicy.src_port;
				if (srcPortValue.includes('-')) {
					var srcPorts = srcPortValue.split('-');
					document.getElementById('modal_src_port_start').value = srcPorts[0] || '';
					if (document.getElementById('modal_src_port_end')) {
						document.getElementById('modal_src_port_end').value = srcPorts[1] || '';
					}
				} else {
					document.getElementById('modal_src_port_start').value = srcPortValue;
					if (document.getElementById('modal_src_port_end')) {
						document.getElementById('modal_src_port_end').value = '';
					}
				}
			}
			if (existingPolicy.dest_port && document.getElementById('modal_dest_port_start')) {
				var destPortValue = existingPolicy.dest_port;
				if (destPortValue.includes('-')) {
					var destPorts = destPortValue.split('-');
					document.getElementById('modal_dest_port_start').value = destPorts[0] || '';
					if (document.getElementById('modal_dest_port_end')) {
						document.getElementById('modal_dest_port_end').value = destPorts[1] || '';
					}
				} else {
					document.getElementById('modal_dest_port_start').value = destPortValue;
					if (document.getElementById('modal_dest_port_end')) {
						document.getElementById('modal_dest_port_end').value = '';
					}
				}
			}
			
			// 인터페이스
			if (document.getElementById('modal_interface')) {
				document.getElementById('modal_interface').value = existingPolicy.interface || 'LAN';
			}
		}, 100);
	}
}

// 새 정책 추가 함수
function addNewPolicy() {
	var uci = L.uci;
	
	// 모달에서 입력된 값들 수집
	var policyName = document.getElementById('modal_policy_name').value || 'policy_' + Date.now();
	var enabled = document.getElementById('modal_service_enabled').checked ? '1' : '0';
	var priority = document.getElementById('modal_priority').value;
	var inputDevice = document.getElementById('modal_input_device').value;
	var targetType = document.getElementById('modal_target_type').value;
	var chain = document.getElementById('modal_chain').value;
	var protocol = document.getElementById('modal_protocol').value;
	var srcAddr = document.getElementById('modal_src_addr').value;
	// 포트 범위 로직 수정: 시작 포트만 있으면 단일 포트, 둘 다 있으면 범위
	var srcPortStart = document.getElementById('modal_src_port_start').value;
	var srcPortEnd = document.getElementById('modal_src_port_end').value;
	var srcPort = '';
	if (srcPortStart) {
		if (srcPortEnd && srcPortEnd !== srcPortStart) {
			srcPort = srcPortStart + '-' + srcPortEnd;
		} else {
			srcPort = srcPortStart;
		}
	}
	
	// 새로 추가된 필드들 수집
	var srcType = document.getElementById('modal_src_type').value;
	var netmask = document.getElementById('modal_netmask').value;
	var portType = document.getElementById('modal_port_type').value;
	
	var destEnabled = document.getElementById('modal_dest_enabled').checked;
	var destIpType = document.getElementById('modal_dest_ip_type').value;
	var destAddr = document.getElementById('modal_dest_addr').value;
	var destNetmask = document.getElementById('modal_dest_netmask').value;
	var destPortType = document.getElementById('modal_dest_port_type').value;
	
	var destPortStart = document.getElementById('modal_dest_port_start').value;
	var destPortEnd = document.getElementById('modal_dest_port_end').value;
	var destPort = '';
	if (destPortStart) {
		if (destPortEnd && destPortEnd !== destPortStart) {
			destPort = destPortStart + '-' + destPortEnd;
		} else {
			destPort = destPortStart;
		}
	}
	var interface_name = document.getElementById('modal_interface').value;
	
	// 새 섹션 추가
	var sid = uci.add('pbr', 'policy');
	
	// UCI에 값 설정
	uci.set('pbr', sid, 'enabled', enabled);
	uci.set('pbr', sid, 'name', policyName);
	if (priority) uci.set('pbr', sid, 'priority', priority);
	if (inputDevice && inputDevice !== 'any') uci.set('pbr', sid, 'input_device', inputDevice);
	if (targetType) uci.set('pbr', sid, 'target_type', targetType);
	if (chain) uci.set('pbr', sid, 'chain', chain);
	if (protocol && protocol !== 'ANY') uci.set('pbr', sid, 'proto', protocol);
	
	// 출발지 관련 필드들
	if (srcType && srcType !== 'AH') uci.set('pbr', sid, 'src_type', srcType);
	if (srcAddr) uci.set('pbr', sid, 'src_addr', srcAddr);
	if (netmask) uci.set('pbr', sid, 'src_netmask', netmask);
	if (portType && portType !== 'ANY') uci.set('pbr', sid, 'src_port_type', portType);
	if (srcPort) uci.set('pbr', sid, 'src_port', srcPort);
	
	// 목적지 관련 필드들
	if (destEnabled) uci.set('pbr', sid, 'dest_enabled', '1');
	if (destIpType && destIpType !== '직접입력(데이터)') uci.set('pbr', sid, 'dest_ip_type', destIpType);
	if (destAddr) uci.set('pbr', sid, 'dest_addr', destAddr);
	if (destNetmask) uci.set('pbr', sid, 'dest_netmask', destNetmask);
	if (destPortType && destPortType !== 'ANY') uci.set('pbr', sid, 'dest_port_type', destPortType);
	if (destPort) uci.set('pbr', sid, 'dest_port', destPort);
	
	if (interface_name) uci.set('pbr', sid, 'interface', interface_name);
	
	// UCI 변경사항 저장 후 페이지 새로고침
	uci.save().then(function() {
		location.reload();
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('저장 실패: ') + err.message), 'error');
	});
}

// 정책 수정 함수
function updatePolicy(policyId) {
	var uci = L.uci;
	
	// 모달에서 입력된 값들 수집
	var policyName = document.getElementById('modal_policy_name').value;
	var enabled = document.getElementById('modal_service_enabled').checked ? '1' : '0';
	var priority = document.getElementById('modal_priority').value;
	var inputDevice = document.getElementById('modal_input_device').value;
	var targetType = document.getElementById('modal_target_type').value;
	var chain = document.getElementById('modal_chain').value;
	var protocol = document.getElementById('modal_protocol').value;
	var srcAddr = document.getElementById('modal_src_addr').value;
	// 포트 범위 로직 수정: 시작 포트만 있으면 단일 포트, 둘 다 있으면 범위
	var srcPortStart = document.getElementById('modal_src_port_start').value;
	var srcPortEnd = document.getElementById('modal_src_port_end').value;
	var srcPort = '';
	if (srcPortStart) {
		if (srcPortEnd && srcPortEnd !== srcPortStart) {
			srcPort = srcPortStart + '-' + srcPortEnd;
		} else {
			srcPort = srcPortStart;
		}
	}
	
	// 새로 추가된 필드들 수집
	var srcType = document.getElementById('modal_src_type').value;
	var netmask = document.getElementById('modal_netmask').value;
	var portType = document.getElementById('modal_port_type').value;
	
	var destEnabled = document.getElementById('modal_dest_enabled').checked;
	var destIpType = document.getElementById('modal_dest_ip_type').value;
	var destAddr = document.getElementById('modal_dest_addr').value;
	var destNetmask = document.getElementById('modal_dest_netmask').value;
	var destPortType = document.getElementById('modal_dest_port_type').value;
	
	var destPortStart = document.getElementById('modal_dest_port_start').value;
	var destPortEnd = document.getElementById('modal_dest_port_end').value;
	var destPort = '';
	if (destPortStart) {
		if (destPortEnd && destPortEnd !== destPortStart) {
			destPort = destPortStart + '-' + destPortEnd;
		} else {
			destPort = destPortStart;
		}
	}
	var interface_name = document.getElementById('modal_interface').value;
	
	// UCI에 값 업데이트
	uci.set('pbr', policyId, 'enabled', enabled);
	if (policyName) uci.set('pbr', policyId, 'name', policyName);
	if (priority) uci.set('pbr', policyId, 'priority', priority);
	if (inputDevice && inputDevice !== 'any') uci.set('pbr', policyId, 'input_device', inputDevice);
	if (targetType) uci.set('pbr', policyId, 'target_type', targetType);
	if (chain) uci.set('pbr', policyId, 'chain', chain);
	if (protocol && protocol !== 'ANY') uci.set('pbr', policyId, 'proto', protocol);
	
	// 출발지 관련 필드들
	if (srcType && srcType !== 'AH') uci.set('pbr', policyId, 'src_type', srcType);
	if (srcAddr) uci.set('pbr', policyId, 'src_addr', srcAddr);
	if (netmask) uci.set('pbr', policyId, 'src_netmask', netmask);
	if (portType && portType !== 'ANY') uci.set('pbr', policyId, 'src_port_type', portType);
	if (srcPort) uci.set('pbr', policyId, 'src_port', srcPort);
	
	// 목적지 관련 필드들
	if (destEnabled) uci.set('pbr', policyId, 'dest_enabled', '1');
	if (destIpType && destIpType !== '직접입력(데이터)') uci.set('pbr', policyId, 'dest_ip_type', destIpType);
	if (destAddr) uci.set('pbr', policyId, 'dest_addr', destAddr);
	if (destNetmask) uci.set('pbr', policyId, 'dest_netmask', destNetmask);
	if (destPortType && destPortType !== 'ANY') uci.set('pbr', policyId, 'dest_port_type', destPortType);
	if (destPort) uci.set('pbr', policyId, 'dest_port', destPort);
	
	if (interface_name) uci.set('pbr', policyId, 'interface', interface_name);
	
	// UCI 변경사항 저장 후 페이지 새로고침
	uci.save().then(function() {
		location.reload();
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('수정 실패: ') + err.message), 'error');
	});
}

