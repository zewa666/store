import { Container } from "aurelia-dependency-injection";
import { Observable, Subscription } from "rxjs";
import { Store } from "./store";
const defaultSelector = (store) => store.state;
export function connectTo(settings) {
    const store = Container.instance.get(Store);
    const _settings = Object.assign({ selector: typeof settings === "function" ? settings : defaultSelector }, settings);
    function getSource(selector) {
        const source = selector(store);
        if (source instanceof Observable) {
            return source;
        }
        return store.state;
    }
    function createSelectors() {
        const isSelectorObj = typeof _settings.selector === "object";
        const fallbackSelector = {
            [_settings.target || "state"]: _settings.selector || defaultSelector
        };
        return Object.entries(Object.assign({}, (isSelectorObj ? _settings.selector : fallbackSelector))).map(([target, selector]) => ({
            targets: _settings.target && isSelectorObj ? [_settings.target, target] : [target],
            selector,
            // numbers are the starting index to slice all the change handling args, 
            // which are prop name, new state and old state
            changeHandlers: {
                [_settings.onChanged || ""]: 1,
                [`${_settings.target || target}Changed`]: _settings.target ? 0 : 1,
                ["propertyChanged"]: 0
            }
        }));
    }
    return function (target) {
        const originalSetup = typeof settings === "object" && settings.setup
            ? target.prototype[settings.setup]
            : target.prototype.bind;
        const originalTeardown = typeof settings === "object" && settings.teardown
            ? target.prototype[settings.teardown]
            : target.prototype.unbind;
        target.prototype[typeof settings === "object" && settings.setup ? settings.setup : "bind"] = function () {
            if (typeof settings == "object" &&
                typeof settings.onChanged === "string" &&
                !(settings.onChanged in this)) {
                throw new Error("Provided onChanged handler does not exist on target VM");
            }
            this._stateSubscriptions = createSelectors().map(s => getSource(s.selector).subscribe((state) => {
                const lastTargetIdx = s.targets.length - 1;
                const oldState = s.targets.reduce((accu = {}, curr) => accu[curr], this);
                Object.entries(s.changeHandlers).forEach(([handlerName, args]) => {
                    if (handlerName in this) {
                        this[handlerName](...[s.targets[lastTargetIdx], state, oldState].slice(args, 3));
                    }
                });
                s.targets.reduce((accu, curr, idx) => {
                    accu[curr] = idx === lastTargetIdx ? state : accu[curr] || {};
                    return accu[curr];
                }, this);
            }));
            if (originalSetup) {
                return originalSetup.apply(this, arguments);
            }
        };
        target.prototype[typeof settings === "object" && settings.teardown ? settings.teardown : "unbind"] = function () {
            if (this._stateSubscriptions && Array.isArray(this._stateSubscriptions)) {
                this._stateSubscriptions.forEach((sub) => {
                    if (sub instanceof Subscription && sub.closed === false) {
                        sub.unsubscribe();
                    }
                });
            }
            if (originalTeardown) {
                return originalTeardown.apply(this, arguments);
            }
        };
    };
}
//# sourceMappingURL=decorator.js.map