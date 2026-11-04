
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch(
      "../database/get-buyer-purchase-requests.php",
      {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to load Purchase Requests."
      );
    }

    // Update buyer account details.
    if (result.buyer) {
      document
        .querySelectorAll(".profile-copy strong, .account-name strong")
        .forEach((element) => {
          element.textContent =
            result.buyer.full_name || element.textContent;
        });

      document
        .querySelectorAll(".profile-copy small, .account-name small")
        .forEach((element) => {
          element.textContent =
            result.buyer.email || element.textContent;
        });
    }

    // Display database records in the Pending Request Table.
    renderDashboardRequests(result.requests || []);

    console.log(
      "Purchase Requests loaded:",
      result.requests
    );

  } catch (error) {
    console.error(
      "Dashboard Purchase Requests could not be loaded:",
      error
    );

    renderDashboardRequests([]);

    showToast(
      "Unable to load Purchase Requests. Check the database connection."
    );
  }
});

const toast = document.getElementById('toast');
let toastTimer;

const dashboardRequests = [];
const dashboardTaskGroups = [];

const dashboardPurchaseOrders = [];
const dashboardInvoices = [];
const monthlyPurchaseActivity = [];

let currentPurchaseRequests = dashboardRequests;
let currentTaskGroups = dashboardTaskGroups;
let currentPurchaseOrders = dashboardPurchaseOrders;
let currentInvoices = dashboardInvoices;

function addCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.append(cell);
  return cell;
}

function renderTableRows(
  selector,
  records,
  fields,
  statusField,
  emptyMessage,
  includeAction = true
) {
  const body = document.querySelector(selector);
  if (!body) return;

  body.replaceChildren();

  if (records.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');

    cell.className = 'table-empty-state';
    cell.colSpan = fields.length + (includeAction ? 1 : 0);
    cell.textContent = emptyMessage;

    row.append(cell);
    body.append(row);
    return;
  }

  records.forEach((record) => {
    const row = document.createElement('tr');

    fields.forEach((field) => {
      const cell = addCell(row, '');

      if (field === statusField) {
        const status = document.createElement('span');
        const label = String(record[field] || 'Pending');

        status.className = `status ${label.toLowerCase()}`;
        status.textContent = label;

        cell.append(status);
      } else {
        cell.textContent = record[field] ?? '';
      }
    });

    if (includeAction) {
      const actionCell = document.createElement('td');
      const actionButton = document.createElement('button');

      actionButton.type = 'button';
      actionButton.className = 'mini-action';

      const isDraft =
        String(record.status).toLowerCase() === 'draft';

      actionButton.textContent = isDraft ? 'Edit' : 'View';

      const recordLabel = record.number || record.task || 'record';

      actionButton.setAttribute(
        'aria-label',
        `${isDraft ? 'Edit' : 'View'} ${recordLabel}`
      );

      // Store the PR number for the Pending Request Table.
      if (selector === '#pending-request-rows') {
        actionButton.dataset.prNumber = record.number || '';
      }

      actionButton.dataset.toast =
        `${record.number || record.task || 'Record'} details opened`;

      actionCell.append(actionButton);
      row.append(actionCell);
    }

    body.append(row);
  });
}

function updateSummaryCard(key, count, emptyText, activeText) {
  const countElement =
    document.querySelector(`[data-summary-count="${key}"]`);

  const stateElement =
    document.querySelector(`[data-summary-state="${key}"]`);

  if (countElement) {
    countElement.textContent = String(count);
  }

  if (stateElement) {
    stateElement.textContent =
      count === 0 ? emptyText : activeText;
  }
}

function updateSummaryCards() {
  const pendingCount = currentPurchaseRequests.filter(
    (task) =>
      String(task.status).toLowerCase() === 'pending'
  ).length;

  const draftCount = currentTaskGroups.find(
    (group) => group.title === 'Draft Purchase Request'
  )?.count ?? 0;

  const pendingInvoiceCount = currentInvoices.filter(
    (invoice) =>
      String(invoice.status).toLowerCase() === 'pending'
  ).length;

  updateSummaryCard(
    'pendingRequests',
    pendingCount,
    'No requests yet.',
    'Awaiting Manager'
  );

  updateSummaryCard(
    'purchaseOrders',
    currentPurchaseOrders.length,
    'No purchase orders yet.',
    'In Progress'
  );

  updateSummaryCard(
    'drafts',
    draftCount,
    'No drafts yet.',
    'Unsubmitted'
  );

  updateSummaryCard(
    'invoices',
    pendingInvoiceCount,
    'No pending invoices.',
    'For 3-Way Match'
  );
}

// ======================================================
// PURCHASE REQUESTS AND MY TASK
// ======================================================

function renderDashboardRequests(requests) {
  if (!Array.isArray(requests)) {
    throw new TypeError(
      'Dashboard purchase requests must be provided as an array.'
    );
  }

  // STEP 1: Display records in Pending Request Table.
  renderTableRows(
    '#pending-request-rows',
    requests,
    ['task', 'number', 'status'],
    'status',
    'No purchase requests yet.',
    true
  );

  currentPurchaseRequests = requests;

  // STEP 2: Define the task categories.
  const categories = [
    {
      status: 'draft',
      title: 'Draft Purchase Request',
      label: 'Ready to Submit',
      tone: 'red'
    },
    
    {
      status: 'approved',
      title: 'Approved Purchase Requests',
      label: 'Ready for RFQ',
      tone: 'green'
    },
    {
      status: 'rejected',
      title: 'Rejected Purchase Requests',
      label: 'Needs Revision',
      tone: 'red'
    }
  ];

  // STEP 3: Organize the same PR records by status.
  const taskGroups = categories
    .map(category => {

      const tasks = requests
        .filter(request =>
          String(request.status).toLowerCase() === category.status
        )
        .map(request => ({
          number: request.number || 'PR',
          priority: 'Medium',
          name: request.task || 'Purchase Request',

          tags: [
            request.category && request.category !== '—'
              ? request.category
              : 'Purchase Request'
          ],

          start: request.created_at
            ? `Created: ${request.created_at}`
            : '',

          due: request.required_date
            ? `Needed: ${request.required_date}`
            : ''
        }));

      return {
        title: category.title,
        count: tasks.length,
        status: category.label,
        tone: category.tone,
        tasks: tasks
      };
    })

    // Do not display empty task categories.
    .filter(group => group.tasks.length > 0);

  // STEP 4: Display records in My Task.
  renderDashboardTasks(taskGroups);
}

function renderDashboardTasks(groups) {
  if (!Array.isArray(groups)) {
    throw new TypeError(
      'Dashboard task groups must be provided as an array.'
    );
  }

  currentTaskGroups = groups;

  const board = document.querySelector('.task-board');

  if (!board) return;

  board.replaceChildren();

  if (groups.length === 0) {
    const emptyState = document.createElement('p');

    emptyState.className = 'task-empty-state';
    emptyState.setAttribute('role', 'status');
    emptyState.textContent = 'No tasks available yet.';

    board.append(emptyState);

    return;
  }

  groups.forEach((taskGroup) => {
    const group = document.createElement('section');
    group.className = 'task-group';

    const heading = document.createElement('div');
    heading.className = 'task-group-heading';

    const count = document.createElement('span');
    count.className = 'task-counter';
    count.textContent = String(
      taskGroup.count ?? taskGroup.tasks.length
    );

    const title = document.createElement('h3');
    title.textContent = taskGroup.title;

    const status = document.createElement('span');
    status.className =
      `task-group-status task-group-status-${taskGroup.tone}`;

    status.dataset.status = taskGroup.status;
    status.textContent = taskGroup.status;

    heading.append(count, title, status);

    const items = document.createElement('div');
    items.className = 'task-items';

    taskGroup.tasks.forEach((task) => {
      const card = document.createElement('article');
      card.className = 'task-item';

      const metadata = document.createElement('div');
      metadata.className = 'task-item-meta';

      const number = document.createElement('span');
      number.className = 'task-reference';
      number.textContent = task.number;

      const priority = document.createElement('span');
      priority.className =
        `task-priority task-priority-${task.priority.toLowerCase()}`;

      priority.textContent = task.priority;

      metadata.append(number, priority);

      const name = document.createElement('h4');
      name.className = 'task-item-name';
      name.textContent = task.name;

      const details = document.createElement('div');
      details.className = 'task-item-details';

      task.tags.forEach((tagText) => {
        const tag = document.createElement('span');

        tag.className = 'task-detail-chip';
        tag.textContent = tagText;

        details.append(tag);
      });

      const dates = document.createElement('div');
      dates.className = 'task-date-row';

      const start = document.createElement('span');
      start.textContent = task.start;

      const due = document.createElement('span');
      due.textContent = task.due;

      dates.append(start, due);

      const progress = document.createElement('div');
      progress.className = 'task-progress';
      progress.setAttribute('aria-hidden', 'true');

      progress.append(
        document.createElement('span'),
        document.createElement('span')
      );

      // Container for the three-dot menu.
      const taskMenu = document.createElement('div');
      taskMenu.className = 'task-menu';

      // Three-dot toggle button.
      const menuToggle = document.createElement('button');

      menuToggle.type = 'button';
      menuToggle.className = 'task-info-badge task-menu-toggle';
      menuToggle.textContent = '⋮';

      menuToggle.setAttribute(
        'aria-label',
        'Show task actions'
      );

      menuToggle.setAttribute(
        'aria-expanded',
        'false'
      );

      // Actions are hidden by default.
      const actionRow = document.createElement('div');

      actionRow.className = 'task-actions';
      actionRow.hidden = true;

      // Available actions for each task category.
      const actionsByGroup = {
        'Draft Purchase Request': [
          'Delete Draft',
          'Submit for Approval',
          'View PR'
        ],

        'Purchase Requests Awaiting Approval': [
          'View PR'
        ],

        'Approved Purchase Requests': [
          'Create RFQ',
          'View PR',
          'Print PR'
        ],

        'RFQs Awaiting Quotation': [
          'Enter Quotation',
          'View RFQ',
          'Send Reminder'
        ],

        'Invoice': [
          'Post Accounting',
          'View Invoice',
          'Print Invoice'
        ],

        'Rejected': [
          'Escalate to Manager',
          'View Task',
          'Update Deadline'
        ],

        'Rejected Purchase Requests': [
          'Escalate to Manager',
          'View Task',
          'Update Deadline'
        ]
      };

      const actions = actionsByGroup[taskGroup.title] || [];

      actions.forEach((actionName) => {
        const actionButton = document.createElement('button');

        actionButton.type = 'button';
        actionButton.className = 'task-action-button';
        actionButton.textContent = actionName;

        // Draft PR actions are handled by the click listener.
        if (
          taskGroup.title !== 'Draft Purchase Request' ||
          !['Delete Draft', 'Submit for Approval', 'View PR']
            .includes(actionName)
        ) {
          actionButton.dataset.toast =
            `${actionName} is ready for implementation.`;
        }

        actionRow.append(actionButton);
      });

      // Add menu components.
      taskMenu.append(menuToggle, actionRow);

      // Add card elements.
      card.append(
        metadata,
        name,
        details,
        dates,
        progress,
        taskMenu
      );

      items.append(card);
    });

    group.append(heading, items);
    board.append(group);
  });

  updateSummaryCards();
}

// ======================================================
// PURCHASE ORDERS
// ======================================================

function renderDashboardPurchaseOrders(orders) {
  if (!Array.isArray(orders)) {
    throw new TypeError(
      'Purchase orders must be provided as an array.'
    );
  }

  currentPurchaseOrders = orders;

  updateSummaryCards();

  renderTableRows(
    '#arriving-next-rows',
    orders,
    [
      'task',
      'category',
      'quantity',
      'amount',
      'number',
      'supplier'
    ],
    null,
    'No purchase orders yet.'
  );
}

// ======================================================
// INVOICES
// ======================================================

function renderDashboardInvoices(invoices) {
  if (!Array.isArray(invoices)) {
    throw new TypeError(
      'Invoices must be provided as an array.'
    );
  }

  currentInvoices = invoices;

  updateSummaryCards();
}

// ======================================================
// MONTHLY PURCHASE ACTIVITY
// ======================================================

function renderMonthlyPurchaseActivity(activity) {
  if (!Array.isArray(activity)) {
    throw new TypeError(
      'Monthly purchase activity must be provided as an array.'
    );
  }

  const chart = document.querySelector('.activity-chart');
  const line = document.querySelector('.chart-area-line');
  const fill = document.querySelector('.chart-area-fill');
  const labels = document.querySelector('.chart-months');
  const values = document.querySelector('.chart-values');

  if (!chart || !line || !fill || !labels || !values) {
    return;
  }

  const points = activity.map((entry) => {
    const value = Number(entry.value);

    if (
      !entry.month ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new TypeError(
        'Each activity entry needs a month and a non-negative numeric value.'
      );
    }

    return {
      month: String(entry.month),
      value
    };
  });

  chart.classList.toggle(
    'is-empty',
    points.length === 0
  );

  chart.setAttribute(
    'aria-label',
    points.length
      ? `Monthly purchase activity with ${points.length} data points.`
      : 'Monthly purchase activity'
  );

  line.setAttribute('d', '');
  fill.setAttribute('d', '');
  labels.replaceChildren();

  if (points.length === 0) return;

  const left = 455;
  const right = 1371;
  const top = 462.5;
  const baseline = 652.5;

  const scaleMax = Math.max(
    100000,
    ...points.map((point) => point.value)
  );

  values.replaceChildren();

  for (let step = 5; step >= 1; step -= 1) {
    const label = document.createElement('span');

    label.textContent =
      `${Math.round(
        scaleMax * step / 5 / 1000
      )}K`;

    values.append(label);
  }

  const plottedPoints = points.map(
    (point, index) => ({
      x:
        points.length === 1
          ? (left + right) / 2
          : left +
            (right - left) *
              index /
              (points.length - 1),

      y:
        baseline -
        (baseline - top) *
          point.value /
          scaleMax
    })
  );

  const linePath = plottedPoints.reduce(
    (path, point, index, plotted) => {
      if (index === 0) {
        return `M${point.x} ${point.y}`;
      }

      const previous = plotted[index - 1];
      const beforePrevious = plotted[index - 2] || previous;
      const next = plotted[index + 1] || point;

      const control1X =
        previous.x + (point.x - beforePrevious.x) / 6;

      const control1Y =
        previous.y + (point.y - beforePrevious.y) / 6;

      const control2X =
        point.x - (next.x - previous.x) / 6;

      const control2Y =
        point.y - (next.y - previous.y) / 6;

      return `${path} C${control1X} ${control1Y}, ${control2X} ${control2Y}, ${point.x} ${point.y}`;
    },
    ''
  );

  line.setAttribute('d', linePath);

  fill.setAttribute(
    'd',
    `${linePath} L${plottedPoints[plottedPoints.length - 1].x} ${baseline} L${plottedPoints[0].x} ${baseline} Z`
  );

  points.forEach((point) => {
    const label = document.createElement('span');

    label.textContent = point.month;

    labels.append(label);
  });

  labels.style.gridTemplateColumns =
    `repeat(${points.length}, minmax(0, 1fr))`;
}

// ======================================================
// BUDGET
// ======================================================

function renderDashboardBudget(budget) {
  const emptyState =
    document.getElementById('budget-empty-state');

  const remainingElement =
    document.getElementById('budget-remaining');

  const totalElement =
    document.getElementById('budget-total');

  const meter =
    document.getElementById('budget-meter');

  const categoriesElement =
    document.getElementById('budget-categories');

  const percentageElement =
    document.getElementById('budget-percent');

  if (
    !emptyState ||
    !remainingElement ||
    !totalElement ||
    !meter ||
    !categoriesElement ||
    !percentageElement
  ) {
    return;
  }

  if (budget == null) {
    emptyState.hidden = false;
    remainingElement.hidden = true;
    totalElement.hidden = true;
    meter.hidden = true;
    categoriesElement.hidden = true;
    percentageElement.hidden = true;

    return;
  }

  const remaining = Number(budget.remaining);
  const total = Number(budget.total);

  if (
    !Number.isFinite(remaining) ||
    !Number.isFinite(total) ||
    total < 0 ||
    remaining < 0 ||
    remaining > total
  ) {
    throw new TypeError(
      'Budget data must include non-negative amounts with remaining not exceeding total.'
    );
  }

  emptyState.hidden = true;
  remainingElement.hidden = false;
  totalElement.hidden = false;
  meter.hidden = false;
  categoriesElement.hidden = false;
  percentageElement.hidden = false;

  const formatAmount = (amount) =>
    `Php. ${amount.toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`;

  remainingElement.textContent =
    formatAmount(remaining);

  totalElement.textContent =
    `From ${formatAmount(total)}`;

  const percent =
    total === 0
      ? 0
      : Math.round((remaining / total) * 100);

  percentageElement.textContent =
    budget.change || `${percent}%`;

  meter.setAttribute(
    'aria-label',
    `Budget remaining ${percent} percent`
  );

  meter.replaceChildren();
  categoriesElement.replaceChildren();

  const colors = [
    '#408bff',
    '#34c56f',
    '#f0b32a',
    '#8b5cf6'
  ];

  const categories =
    Array.isArray(budget.categories)
      ? budget.categories
      : [];

  let committed = 0;

  categories.forEach((category, index) => {
    const amount = Number(category.amount);

    if (
      !category.name ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      throw new TypeError(
        'Each budget category needs a name and a non-negative numeric amount.'
      );
    }

    committed += amount;

    const segment =
      document.createElement('span');

    segment.className = 'budget-segment';

    segment.style.width =
      `${total === 0
        ? 0
        : Math.min(100, amount / total * 100)}%`;

    segment.style.backgroundColor =
      category.color ||
      colors[index % colors.length];

    segment.setAttribute(
      'aria-label',
      `${category.name}: ${formatAmount(amount)}`
    );

    meter.append(segment);

    const legend =
      document.createElement('span');

    legend.className = 'budget-category';

    const dot =
      document.createElement('span');

    dot.className = 'budget-category-dot';

    dot.style.backgroundColor =
      category.color ||
      colors[index % colors.length];

    const name =
      document.createElement('span');

    name.textContent = category.name;

    legend.append(dot, name);

    categoriesElement.append(legend);
  });

  const remainingSegment =
    document.createElement('span');

  remainingSegment.className = 'budget-segment';

  remainingSegment.style.width =
    `${total === 0
      ? 0
      : Math.max(0, (total - committed) / total * 100)}%`;

  remainingSegment.style.backgroundColor = '#e9e9e9';

  remainingSegment.setAttribute(
    'aria-label',
    `Unallocated budget: ${formatAmount(
      Math.max(0, total - committed)
    )}`
  );

  meter.append(remainingSegment);

  if (total > 0) {
    const remainingLegend =
      document.createElement('span');

    remainingLegend.className = 'budget-category';

    const remainingDot =
      document.createElement('span');

    remainingDot.className = 'budget-category-dot';
    remainingDot.style.backgroundColor = '#d9d9d9';

    const remainingName =
      document.createElement('span');

    remainingName.textContent = 'Not Commited';

    remainingLegend.append(remainingDot, remainingName);
    categoriesElement.append(remainingLegend);
  }
}

// ======================================================
// EXPOSE DASHBOARD FUNCTIONS
// ======================================================

window.renderDashboardRequests =
  renderDashboardRequests;

window.renderDashboardTasks =
  renderDashboardTasks;

window.renderDashboardPurchaseOrders =
  renderDashboardPurchaseOrders;

window.renderDashboardInvoices =
  renderDashboardInvoices;

window.renderMonthlyPurchaseActivity =
  renderMonthlyPurchaseActivity;

window.renderDashboardBudget =
  renderDashboardBudget;

// Initial dashboard rendering.
renderDashboardRequests(dashboardRequests);
renderDashboardTasks(dashboardTaskGroups);

renderDashboardPurchaseOrders(
  dashboardPurchaseOrders
);

renderDashboardInvoices(
  dashboardInvoices
);

renderMonthlyPurchaseActivity(
  monthlyPurchaseActivity
);

renderDashboardBudget({
  remaining: 0,
  total: 0,
  categories: []
});

// ======================================================
// TOAST NOTIFICATION
// ======================================================

function showToast(message) {
  if (!toast || !message) return;

  toast.textContent = message;
  toast.classList.add('is-visible');

  window.clearTimeout(toastTimer);

  toastTimer = window.setTimeout(
    () => toast.classList.remove('is-visible'),
    2200
  );
}

// ======================================================
// SIDEBAR NAVIGATION
// ======================================================

document.querySelectorAll('.nav-item')
  .forEach((button) => {
    button.addEventListener('click', () => {
      document
        .querySelectorAll('.nav-item')
        .forEach((item) =>
          item.classList.remove('is-active')
        );

      button.classList.add('is-active');

      showToast(
        `${button.dataset.view} workspace selected.`
      );
    });
  });

// ======================================================
// DASHBOARD CLICK EVENTS
// ======================================================

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;

  // THREE-DOT MENU TOGGLE
const menuToggle = event.target.closest('.task-menu-toggle');

if (menuToggle) {
  const menu = menuToggle.closest('.task-menu');
  const actionRow = menu.querySelector('.task-actions');

  const isOpening = actionRow.hidden;

  actionRow.hidden = !isOpening;

  // Change three dots into X when opened.
  menuToggle.textContent = isOpening ? '×' : '⋮';

  menuToggle.classList.toggle('is-open', isOpening);

  menuToggle.setAttribute(
    'aria-label',
    isOpening ? 'Hide task actions' : 'Show task actions'
  );

  menuToggle.setAttribute(
    'aria-expanded',
    String(isOpening)
  );

  return;
}

  // MY TASK ACTION BUTTONS.
  const taskButton = event.target.closest('.task-action-button');

  if (taskButton) {
    const actionText = taskButton.textContent
      .replace(/\s+/g, ' ')
      .trim();

    const taskCard = taskButton.closest('.task-item');

    const prNumber = taskCard
      ?.querySelector('.task-reference')
      ?.textContent.trim();

    // VIEW PURCHASE REQUEST.
    if (actionText === 'View PR' && prNumber) {
      window.location.href =
        `view-purchase-request.html?pr=${encodeURIComponent(prNumber)}`;

      return;
    }

    // DELETE DRAFT / SUBMIT FOR APPROVAL.
    if (
      ['Delete Draft', 'Submit for Approval'].includes(actionText) &&
      prNumber
    ) {
      const action =
        actionText === 'Delete Draft' ? 'delete' : 'submit';

      const confirmationMessage =
        action === 'delete'
          ? `Are you sure you want to permanently delete ${prNumber}?`
          : `Submit ${prNumber} for Manager approval?`;

      if (!window.confirm(confirmationMessage)) {
        return;
      }

      taskButton.disabled = true;

      (async () => {
        try {
          const response = await fetch(
            '../database/buyer-draft-action.php',
            {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                action: action,
                pr_number: prNumber
              })
            }
          );

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(
              result.message || 'Unable to process this action.'
            );
          }

          showToast(result.message);

          // Refresh Pending Request Table and My Task.
          window.setTimeout(() => {
            window.location.reload();
          }, 700);

        } catch (error) {
          console.error(
            'Draft Purchase Request action error:',
            error
          );

          showToast(error.message);

          taskButton.disabled = false;
        }
      })();

      return;
    }
  }

  // OPEN THE SELECTED PURCHASE REQUEST FROM THE TABLE.
  const prAction = event.target.closest(
    '#pending-request-rows .mini-action'
  );

  if (prAction && prAction.dataset.prNumber) {
    window.location.href =
      `view-purchase-request.html?pr=${encodeURIComponent(
        prAction.dataset.prNumber
      )}`;

    return;
  }

  // NEW PURCHASE REQUEST QUICK ACTION.
  const quickAction = event.target.closest('.quick-action');

  if (
    quickAction &&
    quickAction.getAttribute('aria-label') === 'New Purchase Request'
  ) {
    event.preventDefault();

    window.location.href = 'new-purchase-request.html';
    return;
  }

  // OTHER DASHBOARD BUTTONS.
  const button = event.target.closest('[data-toast]');

  if (button) {
    showToast(button.dataset.toast);
  }
});
