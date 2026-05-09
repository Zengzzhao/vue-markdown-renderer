// 在主组件中将组件的props通过inject租入传给子组件，子组件通过provide使用 
import { inject, provide } from "vue";
import type { Component } from "vue";

const configPropsKey = Symbol("configProps");

export interface ProxyProps {
  componentsMap?: Record<string, Component>;
  echartRenderer?: Component;
  echartRendererPlaceholder?: Component;
  codeBlockRenderer?: Component;
}

export function provideProxyProps(props: ProxyProps) {
  provide(configPropsKey, props);
}

export function useProxyProps() {
  return inject<ProxyProps>(configPropsKey)!;
}
