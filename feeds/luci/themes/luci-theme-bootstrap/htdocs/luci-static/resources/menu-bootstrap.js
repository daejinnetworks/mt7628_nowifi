'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__: function() {
		ui.menu.load().then(L.bind(this.render, this));
	},

	render: function(tree) {
		var node = tree,
		    url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	renderTabMenu: function(tree, url, level) {
		var container = document.querySelector('#tabmenu'),
		    ul = E('ul', { 'class': 'tabs' }),
		    children = ui.menu.getChildren(tree),
		    activeNode = null;

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.dispatchpath[3 + (level || 0)] == children[i].name),
			    activeClass = isActive ? ' active' : '',
			    className = 'tabmenu-item-%s %s'.format(children[i].name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, children[i].name) }, [ _(children[i].title) ] )]));

			if (isActive)
				activeNode = children[i];
		}

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderMainMenu: function(tree, url, level) {
		console.log('[renderMainMenu] >>> ENTRY', { level, url, tree });
		var ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu'),
		    children = ui.menu.getChildren(tree);

		console.log('[renderMainMenu] level:', level, '| children:', children.map(c => c.name));

		if (!level) console.log('Top menu children:', children.map(c => c.name));

		if (children.length == 0 || level > 1)
			return E([]);

		// For top-level menu, move 'logout' to the end
		var topLevel = !level;
		var childrenCopy = children.slice();
		console.log('[renderMainMenu] childrenCopy (init):', childrenCopy.map(c => c.name));
		if (topLevel) {
			var logoutIdx = childrenCopy.findIndex(function(item) { return item.name === 'logout' || item.name === 'admin/logout'; });
			console.log('[renderMainMenu] logoutIdx:', logoutIdx);
			if (logoutIdx !== -1) {
				var logoutItem = childrenCopy.splice(logoutIdx, 1)[0];
				console.log('[renderMainMenu] logoutItem:', logoutItem);
				childrenCopy.push(logoutItem);
				console.log('[renderMainMenu] childrenCopy after moving logout:', childrenCopy.map(c => c.name));
			}
		}

		if (topLevel) {
			// 1. Render all non-logout items
			var nonLogoutItems = childrenCopy.filter(function(item) { return item.name !== 'logout'; });
			for (var i = 0; i < nonLogoutItems.length; i++) {
				var submenu = this.renderMainMenu(nonLogoutItems[i], url + '/' + nonLogoutItems[i].name, (level || 0) + 1),
					subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
					linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
					linkurl = submenu.firstElementChild ? '#' : L.url(url, nonLogoutItems[i].name);

				var linkChildren = [];
				linkChildren.push(_(nonLogoutItems[i].title));

				var li = E('li', { 'class': subclass }, [
					E('a', { 'class': linkclass, 'href': linkurl }, linkChildren),
					submenu
				]);
				ul.appendChild(li);
			}
			// 2. Add blank items to make total 6 (logout will be 7th)
			var menuCount = nonLogoutItems.length;
			for (var j = menuCount; j < 6; j++) {
				ul.appendChild(E('li', { style: 'width: 100px; min-width: 100px; max-width: 100px;' }, ['\u00A0']));
			}
			// 3. Render logout as the last (7th) item
			var logoutItem = childrenCopy.find(function(item) { return item.name === 'logout'; });
			if (logoutItem) {
				var submenu = this.renderMainMenu(logoutItem, url + '/' + logoutItem.name, (level || 0) + 1),
					subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
					linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
					linkurl = submenu.firstElementChild ? '#' : L.url(url, logoutItem.name);

				var linkChildren = [];
				linkChildren.push(
					E('img', {
						src: '/luci-static/bootstrap/logout_custom.png',
						alt: 'logout',
						style: 'height:18px;width:auto;margin-right:6px;vertical-align:middle;'
					})
				);
				linkChildren.push(_(logoutItem.title));

				var li = E('li', { 'class': subclass }, [
					E('a', { 'class': linkclass, 'href': linkurl }, linkChildren),
					submenu
				]);
				ul.appendChild(li);
			}
		} else {
			// Not top level: render as before
			for (var i = 0; i < childrenCopy.length; i++) {
				var submenu = this.renderMainMenu(childrenCopy[i], url + '/' + childrenCopy[i].name, (level || 0) + 1),
					subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
					linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
					linkurl = submenu.firstElementChild ? '#' : L.url(url, childrenCopy[i].name);

				var linkChildren = [];
				linkChildren.push(_(childrenCopy[i].title));

				var li = E('li', { 'class': subclass }, [
					E('a', { 'class': linkclass, 'href': linkurl }, linkChildren),
					submenu
				]);
				ul.appendChild(li);
			}
		}

		ul.style.display = '';
		console.log('[renderMainMenu] <<< EXIT', { level, url, ul });
		return ul;
	},

	renderModeMenu: function(tree) {
		var ul = document.querySelector('#modemenu'),
		    children = ui.menu.getChildren(tree);

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.requestpath.length ? children[i].name == L.env.requestpath[0] : i == 0);

			ul.appendChild(E('li', { 'class': isActive ? 'active' : null }, [
				E('a', { 'href': L.url(children[i].name) }, [ _(children[i].title) ])
			]));

			if (isActive)
				this.renderMainMenu(children[i], children[i].name);
		}

		if (ul.children.length > 1)
			ul.style.display = '';
	}
});
