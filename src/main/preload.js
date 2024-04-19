const { contextBridge, ipcRenderer } = require('electron');

const uinToUidMap = new Map();
const uidToUinMap = new Map();

/**
 * 调用一个qq底层函数，并返回函数返回值。
 * @param { String } eventName 函数事件名。
 * @param { String } cmdName 函数名。
 * @param { Boolean } registered 函数是否注册。
 * @param  { ...any } args 函数参数。
 * @returns { Promise<any> } 函数返回值。
 */
function invokeNative(eventName, cmdName, registered, ...args) {
    return new Promise(resolve => {
        const callbackId = crypto.randomUUID();
        const callback = (event, ...args) => {
            if (args?.[0]?.callbackId == callbackId) {
                ipcRenderer.off('IPC_DOWN_2', callback);
                resolve(args[1]);
            }
        };
        ipcRenderer.on('IPC_DOWN_2', callback);
        ipcRenderer.send('IPC_UP_2', {
            type: 'request',
            callbackId,
            eventName: `${ eventName }-2${ registered ? '-register' : '' }`
        }, [ cmdName, ...args ]);
    });
} 

/**
 * 为qq底层事件 `cmdName` 添加 `handler` 处理器。
 * @param { String } cmdName 事件名称。
 * @param { Function } handler 事件处理器。
 * @returns { Function } 新的处理器。
 */
function subscribeEvent(cmdName, handler) {
    const listener = (event, ...args) => {
        if (args?.[1]?.[0]?.cmdName == cmdName) {
            handler(args[1][0].payload);
        }
    };
    ipcRenderer.on('IPC_DOWN_2', listener);
    return listener;
}

contextBridge.exposeInMainWorld('euphonyNative', {
    invokeNative,
    subscribeEvent,
    /**
     * 移除qq底层事件的 `handler` 处理器。
     * 请注意，`handler` 并不是传入 `subscribeEvent` 的处理器，而是其返回的新处理器。
     * @param { Function } handler 事件处理器。
     */
    unsubscribeEvent: handler => ipcRenderer.off('IPC_DOWN_2', handler),
    /**
     * 获取好友 `uin` 代表的 **uid**。
     * @param { String } uin 好友的 **qq号**。
     * @returns { String } 好友 `uin` 代表的 **uid**。
     */
    convertUinToUid: uin => uinToUidMap.get(uin),
    /**
     * 获取好友 `uid` 代表的 **qq号**。
     * @param { String } uid 好友的 **uid**。
     * @returns { String } 好友 `uid` 代表的 **qq号**。
     */
    convertUidToUin: uid => uidToUinMap.get(uid)
});

subscribeEvent('onBuddyListChange', payload => {
    for (const category of payload.data) {
        for (const friend of category.buddyList) {
            uinToUidMap.set(friend.uin, friend.uid);
            uidToUinMap.set(friend.uid, friend.uin);
        }
    }
});
invokeNative('ns-ntApi', 'nodeIKernelBuddyService/getBuddyList', false, { force_update: true });