const editCommands = new Set(['new-part','preview','rotate-draft','commit-draft','add','select','drag',
  'move','rotate','delete','undo','request-reset','request-load-best','cancel','confirm','orientation-change']);
export const isEditCommand = command => editCommands.has(command.type);
export const permitsEdit = screen => screen === 'DESIGN';

export function createFrameClock({step, pause, tickMs = 1000 / 60, maxTicks = 5, pauseGap = 250}) {
  let last = null;
  let remainder = 0;
  return {
    reset() { last = null; remainder = 0; },
    advance(timestamp) {
      if(!Number.isFinite(timestamp) || last!==null&&(timestamp<last||timestamp-last>=pauseGap)){
        this.reset();
        pause('更新間隔');
        return 0;
      }
      if(last===null){last=timestamp;return 0;}
      const elapsed=timestamp-last+remainder;
      const due=Math.floor((elapsed+1e-9)/tickMs);
      remainder=Math.max(0,elapsed-due*tickMs);
      last=timestamp;
      let completed=0;
      while(completed<Math.min(due,maxTicks) && step()) completed++;
      return completed;
    },
  };
}
