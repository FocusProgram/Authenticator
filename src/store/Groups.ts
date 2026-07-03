import { GroupStorage } from "../models/storage";
import { ActionContext } from "vuex";

export class Groups implements Module {
  async getModule() {
    return {
      state: {
        groups: await GroupStorage.get(),
        activeGroupId: "__all__",
      },
      mutations: {
        setGroups(state: GroupsState, groups: OTPGroupInterface[]) {
          state.groups = groups;
        },
        setActiveGroup(state: GroupsState, groupId: string) {
          state.activeGroupId = groupId;
        },
      },
      actions: {
        async refreshGroups(state: ActionContext<GroupsState, object>) {
          state.commit("setGroups", await GroupStorage.get());
        },
        async createGroup(
          state: ActionContext<GroupsState, object>,
          name: string
        ) {
          const trimmedName = name.trim();
          if (!trimmedName) {
            return null;
          }

          const group = {
            id: crypto.randomUUID(),
            name: trimmedName,
            index: state.state.groups.length,
          };
          await GroupStorage.add(group);
          await state.dispatch("refreshGroups");
          state.commit("setActiveGroup", group.id);
          return group;
        },
        async renameGroup(
          state: ActionContext<GroupsState, object>,
          args: { id: string; name: string }
        ) {
          const group = state.state.groups.find((item) => item.id === args.id);
          if (!group) {
            return;
          }

          await GroupStorage.update({
            ...group,
            name: args.name,
          });
          await state.dispatch("refreshGroups");
        },
        async deleteGroup(
          state: ActionContext<GroupsState, object>,
          groupId: string
        ) {
          await GroupStorage.delete(groupId);
          await state.dispatch("refreshGroups");
          if (state.state.activeGroupId === groupId) {
            state.commit("setActiveGroup", "__all__");
          }
          await state.dispatch("accounts/updateEntries", undefined, {
            root: true,
          });
        },
        async moveGroup(
          state: ActionContext<GroupsState, object>,
          args: { from: number; to: number }
        ) {
          const groups = state.state.groups.slice();
          groups.splice(args.to, 0, groups.splice(args.from, 1)[0]);
          const normalized = groups.map((group, index) => ({
            ...group,
            index,
          }));
          await GroupStorage.set(normalized);
          await state.dispatch("refreshGroups");
        },
      },
      namespaced: true,
    };
  }
}
