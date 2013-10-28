/**
 * $Id: mxEdgeHandler.js,v 1.19 2013/10/28 08:45:07 gaudenz Exp $
 * Copyright (c) 2006-2013, JGraph Ltd
 */
/**
 * Class: mxEdgeHandler
 *
 * Graph event handler that reconnects edges and modifies control points and
 * the edge label location. Uses <mxTerminalMarker> for finding and
 * highlighting new source and target vertices. This handler is automatically
 * created in <mxGraph.createHandler> for each selected edge.
 * 
 * To enable adding/removing control points, the following code can be used:
 * 
 * (code)
 * mxEdgeHandler.prototype.addEnabled = true;
 * mxEdgeHandler.prototype.removeEnabled = true;
 * (end)
 * 
 * Note: This experimental feature is not recommended for production use.
 * 
 * Constructor: mxEdgeHandler
 *
 * Constructs an edge handler for the specified <mxCellState>.
 * 
 * Parameters:
 * 
 * state - <mxCellState> of the cell to be handled.
 */
function mxEdgeHandler(state)
{
	if (state != null)
	{
		this.state = state;
		this.init();
	}
};

/**
 * Variable: graph
 * 
 * Reference to the enclosing <mxGraph>.
 */
mxEdgeHandler.prototype.graph = null;

/**
 * Variable: state
 * 
 * Reference to the <mxCellState> being modified.
 */
mxEdgeHandler.prototype.state = null;

/**
 * Variable: marker
 * 
 * Holds the <mxTerminalMarker> which is used for highlighting terminals.
 */
mxEdgeHandler.prototype.marker = null;

/**
 * Variable: constraintHandler
 * 
 * Holds the <mxConstraintHandler> used for drawing and highlighting
 * constraints.
 */
mxEdgeHandler.prototype.constraintHandler = null;

/**
 * Variable: error
 * 
 * Holds the current validation error while a connection is being changed.
 */
mxEdgeHandler.prototype.error = null;

/**
 * Variable: shape
 * 
 * Holds the <mxShape> that represents the preview edge.
 */
mxEdgeHandler.prototype.shape = null;

/**
 * Variable: bends
 * 
 * Holds the <mxShapes> that represent the points.
 */
mxEdgeHandler.prototype.bends = null;

/**
 * Variable: labelShape
 * 
 * Holds the <mxShape> that represents the label position.
 */
mxEdgeHandler.prototype.labelShape = null;

/**
 * Variable: cloneEnabled
 * 
 * Specifies if cloning by control-drag is enabled. Default is true.
 */
mxEdgeHandler.prototype.cloneEnabled = true;

/**
 * Variable: addEnabled
 * 
 * Specifies if adding bends by shift-click is enabled. Default is false.
 * Note: This experimental feature is not recommended for production use.
 */
mxEdgeHandler.prototype.addEnabled = false;

/**
 * Variable: removeEnabled
 * 
 * Specifies if removing bends by shift-click is enabled. Default is false.
 * Note: This experimental feature is not recommended for production use.
 */
mxEdgeHandler.prototype.removeEnabled = false;

/**
 * Variable: preferHtml
 * 
 * Specifies if bends should be added to the graph container. This is updated
 * in <init> based on whether the edge or one of its terminals has an HTML
 * label in the container.
 */
mxEdgeHandler.prototype.preferHtml = false;

/**
 * Variable: allowHandleBoundsCheck
 * 
 * Specifies if the bounds of handles should be used for hit-detection in IE
 * Default is true.
 */
mxEdgeHandler.prototype.allowHandleBoundsCheck = true;

/**
 * Variable: snapToTerminals
 * 
 * Specifies if waypoints should snap to the routing centers of terminals.
 * Default is false.
 */
mxEdgeHandler.prototype.snapToTerminals = false;

/**
 * Variable: handleImage
 * 
 * Optional <mxImage> to be used as handles. Default is null.
 */
mxEdgeHandler.prototype.handleImage = null;

/**
 * Variable: tolerance
 * 
 * Optional tolerance for hit-detection in <getHandleForEvent>. Default is 0.
 */
mxEdgeHandler.prototype.tolerance = 0;

/**
 * Function: init
 * 
 * Initializes the shapes required for this edge handler.
 */
mxEdgeHandler.prototype.init = function()
{
	this.graph = this.state.view.graph;
	this.marker = this.createMarker();
	this.constraintHandler = new mxConstraintHandler(this.graph);
	
	// Clones the original points from the cell
	// and makes sure at least one point exists
	this.points = [];
	
	// Uses the absolute points of the state
	// for the initial configuration and preview
	this.abspoints = this.getSelectionPoints(this.state);
	this.shape = this.createSelectionShape(this.abspoints);
	this.shape.dialect = (this.graph.dialect != mxConstants.DIALECT_SVG) ?
		mxConstants.DIALECT_MIXEDHTML : mxConstants.DIALECT_SVG;
	this.shape.init(this.graph.getView().getOverlayPane());
	this.shape.pointerEvents = false;
	this.shape.node.style.cursor = mxConstants.CURSOR_MOVABLE_EDGE;
	mxEvent.redirectMouseEvents(this.shape.node, this.graph, this.state);

	// Updates preferHtml
	this.preferHtml = this.state.text != null &&
		this.state.text.node.parentNode == this.graph.container;
	
	if (!this.preferHtml)
	{
		// Checks source terminal
		var sourceState = this.state.getVisibleTerminalState(true);
		
		if (sourceState != null)
		{
			this.preferHtml = sourceState.text != null &&
				sourceState.text.node.parentNode == this.graph.container;
		}
		
		if (!this.preferHtml)
		{
			// Checks target terminal
			var targetState = this.state.getVisibleTerminalState(false);
			
			if (targetState != null)
			{
				this.preferHtml = targetState.text != null &&
				targetState.text.node.parentNode == this.graph.container;
			}
		}
	}

	// Creates bends for the non-routed absolute points
	// or bends that don't correspond to points
	if (this.graph.getSelectionCount() < mxGraphHandler.prototype.maxCells ||
		mxGraphHandler.prototype.maxCells <= 0)
	{
		this.bends = this.createBends();
	}

	// Adds a rectangular handle for the label position
	this.label = new mxPoint(this.state.absoluteOffset.x, this.state.absoluteOffset.y);
	this.labelShape = new mxRectangleShape(new mxRectangle(), 
		mxConstants.LABEL_HANDLE_FILLCOLOR, mxConstants.HANDLE_STROKECOLOR);
	this.initBend(this.labelShape);
	this.labelShape.node.style.cursor = mxConstants.CURSOR_LABEL_HANDLE;
	mxEvent.redirectMouseEvents(this.labelShape.node, this.graph, this.state);
	
	this.redraw();
};

/**
 * Function: isAddPointEvent
 * 
 * Returns true if the given event is a trigger to add a new point. This
 * implementation returns true if shift is pressed.
 */
mxEdgeHandler.prototype.isAddPointEvent = function(evt)
{
	return mxEvent.isShiftDown(evt);
};

/**
 * Function: isRemovePointEvent
 * 
 * Returns true if the given event is a trigger to remove a point. This
 * implementation returns true if shift is pressed.
 */
mxEdgeHandler.prototype.isRemovePointEvent = function(evt)
{
	return mxEvent.isShiftDown(evt);
};

/**
 * Function: getSelectionPoints
 * 
 * Returns the list of points that defines the selection stroke.
 */
mxEdgeHandler.prototype.getSelectionPoints = function(state)
{
	return state.absolutePoints;
};

/**
 * Function: createSelectionShape
 * 
 * Creates the shape used to draw the selection border.
 */
mxEdgeHandler.prototype.createSelectionShape = function(points)
{
	var shape = new mxPolyline(points, this.getSelectionColor());
	shape.strokewidth = this.getSelectionStrokeWidth();
	shape.isDashed = this.isSelectionDashed();
	
	return shape;
};

/**
 * Function: getSelectionColor
 * 
 * Returns <mxConstants.EDGE_SELECTION_COLOR>.
 */
mxEdgeHandler.prototype.getSelectionColor = function()
{
	return mxConstants.EDGE_SELECTION_COLOR;
};

/**
 * Function: getSelectionStrokeWidth
 * 
 * Returns <mxConstants.EDGE_SELECTION_STROKEWIDTH>.
 */
mxEdgeHandler.prototype.getSelectionStrokeWidth = function()
{
	return mxConstants.EDGE_SELECTION_STROKEWIDTH;
};

/**
 * Function: isSelectionDashed
 * 
 * Returns <mxConstants.EDGE_SELECTION_DASHED>.
 */
mxEdgeHandler.prototype.isSelectionDashed = function()
{
	return mxConstants.EDGE_SELECTION_DASHED;
};

/**
 * Function: isConnectableCell
 * 
 * Returns true if the given cell is connectable. This is a hook to
 * disable floating connections. This implementation returns true.
 */
mxEdgeHandler.prototype.isConnectableCell = function(cell)
{
	return true;
};

/**
 * Function: createMarker
 * 
 * Creates and returns the <mxCellMarker> used in <marker>.
 */
mxEdgeHandler.prototype.createMarker = function()
{
	var marker = new mxCellMarker(this.graph);
	var self = this; // closure

	// Only returns edges if they are connectable and never returns
	// the edge that is currently being modified
	marker.getCell = function(me)
	{
		var cell = mxCellMarker.prototype.getCell.apply(this, arguments);
		var point = self.getPointForEvent(me);

		// Checks for cell under mouse
		if (cell == self.state.cell || cell == null)
		{
			cell = this.graph.getCellAt(point.x, point.y);
			
			if (self.state.cell == cell)
			{
				cell = null;
			}
		}

		var model = self.graph.getModel();
		
		if ((this.graph.isSwimlane(cell) && this.graph.hitsSwimlaneContent(cell, point.x, point.y)) ||
			(!self.isConnectableCell(cell)) ||
			(cell == self.state.cell || (cell != null && !self.graph.connectableEdges && model.isEdge(cell))) ||
			model.isAncestor(self.state.cell, cell))
		{
			cell = null;
		}
		
		return cell;
	};

	// Sets the highlight color according to validateConnection
	marker.isValidState = function(state)
	{
		var model = self.graph.getModel();
		var other = self.graph.view.getTerminalPort(state,
			self.graph.view.getState(model.getTerminal(self.state.cell,
			!self.isSource)), !self.isSource);
		var otherCell = (other != null) ? other.cell : null;
		var source = (self.isSource) ? state.cell : otherCell;
		var target = (self.isSource) ? otherCell : state.cell;
		
		// Updates the error message of the handler
		self.error = self.validateConnection(source, target);

		return self.error == null;
	};
	
	return marker;
};

/**
 * Function: validateConnection
 * 
 * Returns the error message or an empty string if the connection for the
 * given source, target pair is not valid. Otherwise it returns null. This
 * implementation uses <mxGraph.getEdgeValidationError>.
 * 
 * Parameters:
 * 
 * source - <mxCell> that represents the source terminal.
 * target - <mxCell> that represents the target terminal.
 */
mxEdgeHandler.prototype.validateConnection = function(source, target)
{
	return this.graph.getEdgeValidationError(this.state.cell, source, target);
};

/**
 * Function: createBends
 * 
 * Creates and returns the bends used for modifying the edge. This is
 * typically an array of <mxRectangleShapes>.
 */
 mxEdgeHandler.prototype.createBends = function()
 {
	var cell = this.state.cell;
	var bends = [];

	for (var i = 0; i < this.abspoints.length; i++)
	{
		if (this.isHandleVisible(i))
		{
			var source = i == 0;
			var target = i == this.abspoints.length - 1;
			var terminal = source || target;

			if (terminal || this.graph.isCellBendable(cell))
			{				
				var bend = this.createHandleShape(i);
				this.initBend(bend);

				if (this.isHandleEnabled(i))
				{
					bend.node.style.cursor = mxConstants.CURSOR_BEND_HANDLE;
					mxEvent.redirectMouseEvents(bend.node, this.graph, this.state);
				}
				
				bends.push(bend);
			
				if (!terminal)
				{
					this.points.push(new mxPoint(0,0));
					bend.node.style.visibility = 'hidden';
				}
			}
		}
	}

	return bends;
};
/**
 * Function: isHandleEnabled
 * 
 * Creates the shape used to display the given bend.
 */
mxEdgeHandler.prototype.isHandleEnabled = function(index)
{
	return true;
};

/**
 * Function: isHandleVisible
 * 
 * Returns true if the handle at the given index is visible.
 */
mxEdgeHandler.prototype.isHandleVisible = function(index)
{
	return true;
};

/**
 * Function: createHandleShape
 * 
 * Creates the shape used to display the given bend. Note that the index may be
 * null for special cases, such as when called from
 * <mxElbowEdgeHandler.createVirtualBend>.
 */
mxEdgeHandler.prototype.createHandleShape = function(index)
{
	if (this.handleImage != null)
	{
		var shape = new mxImageShape(new mxRectangle(0, 0, this.handleImage.width, this.handleImage.height), this.handleImage.src);
		
		// Allows HTML rendering of the images
		shape.preserveImageAspect = false;

		return shape;
	}
	else
	{
		var s = mxConstants.HANDLE_SIZE;
		
		if (this.preferHtml)
		{
			s -= 1;
		}
		
		return new mxRectangleShape(new mxRectangle(0, 0, s, s), mxConstants.HANDLE_FILLCOLOR, mxConstants.HANDLE_STROKECOLOR);
	}
};

/**
 * Function: initBend
 * 
 * Helper method to initialize the given bend.
 * 
 * Parameters:
 * 
 * bend - <mxShape> that represents the bend to be initialized.
 */
mxEdgeHandler.prototype.initBend = function(bend)
{
	if (this.preferHtml)
	{
		bend.dialect = mxConstants.DIALECT_STRICTHTML;
		bend.init(this.graph.container);
	}
	else
	{
		bend.dialect = (this.graph.dialect != mxConstants.DIALECT_SVG) ?
			mxConstants.DIALECT_MIXEDHTML : mxConstants.DIALECT_SVG;
		bend.init(this.graph.getView().getOverlayPane());
	}
};

/**
 * Function: getHandleForEvent
 * 
 * Returns the index of the handle for the given event.
 */
mxEdgeHandler.prototype.getHandleForEvent = function(me)
{
	// Connection highlight may consume events before they reach sizer handle
	var tol = (!mxEvent.isMouseEvent(me.getEvent())) ? this.tolerance : 1;
	var hit = (this.allowHandleBoundsCheck && (mxClient.IS_IE || tol > 0)) ?
		new mxRectangle(me.getGraphX() - tol, me.getGraphY() - tol, 2 * tol, 2 * tol) : null;
	var minDistSq = null;
	var result = null;
	
	function checkShape(shape)
	{
		if (shape != null && shape.node.style.display != 'none' && shape.node.style.visibility != 'hidden' &&
			(me.isSource(shape) || (hit != null && mxUtils.intersects(shape.bounds, hit))))
		{
			var dx = me.getGraphX() - shape.bounds.getCenterX();
			var dy = me.getGraphY() - shape.bounds.getCenterY();
			var tmp = dx * dx + dy * dy;
			
			if (minDistSq == null || tmp <= minDistSq)
			{
				minDistSq = tmp;
			
				return true;
			}
		}
		
		return false;
	}
	
	if (me.isSource(this.state.text) || checkShape(this.labelShape))
	{
		result = mxEvent.LABEL_HANDLE;
	}
	
	if (this.bends != null)
	{
		for (var i = 0; i < this.bends.length; i++)
		{
			if (checkShape(this.bends[i]))
			{
				result = i;
			}
		}
	}

	return result;
};

/**
 * Function: mouseDown
 * 
 * Handles the event by checking if a special element of the handler
 * was clicked, in which case the index parameter is non-null. The
 * indices may be one of <LABEL_HANDLE> or the number of the respective
 * control point. The source and target points are used for reconnecting
 * the edge.
 */
mxEdgeHandler.prototype.mouseDown = function(sender, me)
{
	var handle = null;
	
	// Handles the case where the state in the event points to another
	// cell if the cell has a HTML label which sits on top of the handles
	// NOTE: Commented out. This should not be required as all HTML labels
	// are in order an do not appear behind the handles.
	//if (mxClient.IS_SVG || me.getState() == this.state)
	{
		handle = this.getHandleForEvent(me);
	}

	if (this.addEnabled && handle == null && this.isAddPointEvent(me.getEvent()))
	{
		this.addPoint(this.state, me.getEvent());
	}
	else if (handle != null && !me.isConsumed() && this.graph.isEnabled())
	{
		if (this.removeEnabled && this.isRemovePointEvent(me.getEvent()))
		{
			this.removePoint(this.state, handle);
		}
		else if (handle != mxEvent.LABEL_HANDLE || this.graph.isLabelMovable(me.getCell()))
		{
			this.start(me.getX(), me.getY(), handle);
		}
		
		me.consume();
	}
};

/**
 * Function: start
 * 
 * Starts the handling of the mouse gesture.
 */
mxEdgeHandler.prototype.start = function(x, y, index)
{
	this.startX = x;
	this.startY = y;

	this.isSource = (this.bends == null) ? false : index == 0;
	this.isTarget = (this.bends == null) ? false : index == this.bends.length - 1;
	this.isLabel = index == mxEvent.LABEL_HANDLE;

	if (this.isSource || this.isTarget)
	{
		var cell = this.state.cell;
		var terminal = this.graph.model.getTerminal(cell, this.isSource);

		if ((terminal == null && this.graph.isTerminalPointMovable(cell, this.isSource)) ||
			(terminal != null && this.graph.isCellDisconnectable(cell, terminal, this.isSource)))
		{
			this.index = index;
		}
	}
	else
	{
		this.index = index;
	}
};

/**
 * Function: clonePreviewState
 * 
 * Returns a clone of the current preview state for the given point and terminal.
 */
mxEdgeHandler.prototype.clonePreviewState = function(point, terminal)
{
	return this.state.clone();
};

/**
 * Function: getSnapToTerminalTolerance
 * 
 * Returns the tolerance for the guides. Default value is
 * gridSize * scale / 2.
 */
mxEdgeHandler.prototype.getSnapToTerminalTolerance = function()
{
	return this.graph.gridSize * this.graph.view.scale / 2;
};

/**
 * Function: getPointForEvent
 * 
 * Returns the point for the given event.
 */
mxEdgeHandler.prototype.getPointForEvent = function(me)
{
	var point = new mxPoint(me.getGraphX(), me.getGraphY());
	
	var tt = this.getSnapToTerminalTolerance();
	var view = this.graph.getView();
	var overrideX = false;
	var overrideY = false;		
	
	if (this.snapToTerminals && tt > 0)
	{
		function snapToPoint(pt)
		{
			if (pt != null)
			{
				var x = pt.x;

				if (Math.abs(point.x - x) < tt)
				{
					point.x = x;
					overrideX = true;
				}
				
				var y = pt.y;

				if (Math.abs(point.y - y) < tt)
				{
					point.y = y;
					overrideY = true;
				}
			}
		}
		
		// Temporary function
		function snapToTerminal(terminal)
		{
			if (terminal != null)
			{
				snapToPoint.call(this, new mxPoint(view.getRoutingCenterX(terminal),
						view.getRoutingCenterY(terminal)));
			}
		};

		snapToTerminal.call(this, this.state.getVisibleTerminalState(true));
		snapToTerminal.call(this, this.state.getVisibleTerminalState(false));

		if (this.abspoints != null)
		{
			for (var i = 0; i < this.abspoints; i++)
			{
				if (i != this.index)
				{
					snapToPoint.call(this, this.abspoints[i]);
				}
			}
		}
	}

	if (this.graph.isGridEnabledEvent(me.getEvent()))
	{
		var scale = view.scale;
		var tr = view.translate;
		
		if (!overrideX)
		{
			point.x = (this.graph.snap(point.x / scale - tr.x) + tr.x) * scale;
		}
		
		if (!overrideY)
		{
			point.y = (this.graph.snap(point.y / scale - tr.y) + tr.y) * scale;
		}
	}
	
	return point;
};

/**
 * Function: getPreviewTerminalState
 * 
 * Updates the given preview state taking into account the state of the constraint handler.
 */
mxEdgeHandler.prototype.getPreviewTerminalState = function(me)
{
	this.constraintHandler.update(me, this.isSource);
	this.marker.process(me);
	var currentState = this.marker.getValidState();
	var result = null;
	
	if (this.constraintHandler.currentFocus != null && this.constraintHandler.currentConstraint != null)
	{
		this.marker.reset();
	}
	
	if (currentState != null)
	{
		result = currentState;
	}
	else if (this.constraintHandler.currentConstraint != null && this.constraintHandler.currentFocus != null)
	{
		result = this.constraintHandler.currentFocus;
	}
	
	return result;
};

/**
 * Function: getPreviewPoints
 * 
 * Updates the given preview state taking into account the state of the constraint handler.
 */
mxEdgeHandler.prototype.getPreviewPoints = function(point)
{
	var geometry = this.graph.getCellGeometry(this.state.cell);
	var points = (geometry.points != null) ? geometry.points.slice() : null;

	if (!this.isSource && !this.isTarget)
	{
		this.convertPoint(point, false);
		
		if (points == null)
		{
			points = [point];
		}
		else
		{
			points[this.index - 1] = point;
		}
	}
	else if (this.graph.resetEdgesOnConnect)
	{
		points = null;
	}
	
	return points;
};

/**
 * Function: updatePreviewState
 * 
 * Updates the given preview state taking into account the state of the constraint handler.
 */
mxEdgeHandler.prototype.updatePreviewState = function(edge, point, terminalState)
{
	// Computes the points for the edge style and terminals
	var sourceState = (this.isSource) ? terminalState : this.state.getVisibleTerminalState(true);
	var targetState = (this.isTarget) ? terminalState : this.state.getVisibleTerminalState(false);
	
	var sourceConstraint = this.graph.getConnectionConstraint(edge, sourceState, true);
	var targetConstraint = this.graph.getConnectionConstraint(edge, targetState, false);

	var constraint = this.constraintHandler.currentConstraint;

	if (constraint == null)
	{
		constraint = new mxConnectionConstraint();
	}
	
	if (this.isSource)
	{
		sourceConstraint = constraint;
	}
	else if (this.isTarget)
	{
		targetConstraint = constraint;
	}
	
	if (!this.isSource || sourceState != null)
	{
		edge.view.updateFixedTerminalPoint(edge, sourceState, true, sourceConstraint);
	}
	
	if (!this.isTarget || targetState != null)
	{
		edge.view.updateFixedTerminalPoint(edge, targetState, false, targetConstraint);
	}
	
	if ((this.isSource || this.isTarget) && terminalState == null)
	{
		edge.setAbsoluteTerminalPoint(point, this.isSource);

		if (this.marker.getMarkedState() == null)
		{
			this.error = (this.graph.allowDanglingEdges) ? null : '';
		}
	}
	
	edge.view.updatePoints(edge, this.points, sourceState, targetState);
	edge.view.updateFloatingTerminalPoints(edge, sourceState, targetState);
};

/**
 * Function: mouseMove
 * 
 * Handles the event by updating the preview.
 */
mxEdgeHandler.prototype.mouseMove = function(sender, me)
{
	if (this.index != null && this.marker != null)
	{
		var point = this.getPointForEvent(me);
		
		if (this.isLabel)
		{
			this.label.x = point.x;
			this.label.y = point.y;
		}
		else
		{
			this.points = this.getPreviewPoints(point);
			var terminalState = (this.isSource || this.isTarget) ? this.getPreviewTerminalState(me) : null;
			var clone = this.clonePreviewState(point, (terminalState != null) ? terminalState.cell : null);
			this.updatePreviewState(clone, point, terminalState);

			// Sets the color of the preview to valid or invalid, updates the
			// points of the preview and redraws
			var color = (this.error == null) ? this.marker.validColor :
				this.marker.invalidColor;
			this.setPreviewColor(color);
			this.abspoints = clone.absolutePoints;
			this.active = true;
		}
		
		this.drawPreview();
		mxEvent.consume(me.getEvent());
		me.consume();
	}
	// Workaround for disabling the connect highlight when over handle
	else if (mxClient.IS_IE && this.getHandleForEvent(me) != null)
	{
		me.consume(false);
	}
};

/**
 * Function: mouseUp
 * 
 * Handles the event to applying the previewed changes on the edge by
 * using <moveLabel>, <connect> or <changePoints>.
 */
mxEdgeHandler.prototype.mouseUp = function(sender, me)
{
	// Workaround for wrong event source in Webkit
	if (this.index != null && this.marker != null)
	{
		var edge = this.state.cell;
		
		// Ignores event if mouse has not been moved
		if (me.getX() != this.startX || me.getY() != this.startY)
		{
			// Displays the reason for not carriying out the change
			// if there is an error message with non-zero length
			if (this.error != null)
			{
				if (this.error.length > 0)
				{
					this.graph.validationAlert(this.error);
				}
			}
			else if (this.isLabel)
			{
				this.moveLabel(this.state, this.label.x, this.label.y);
			}
			else if (this.isSource || this.isTarget)
			{
				var terminal = null;
				
				if (this.constraintHandler.currentConstraint != null &&
					this.constraintHandler.currentFocus != null)
				{
					terminal = this.constraintHandler.currentFocus.cell;
				}
				
				if (terminal == null && this.marker.hasValidState())
				{
					terminal = this.marker.validState.cell;
				}
				
				if (terminal != null)
				{
					edge = this.connect(edge, terminal, this.isSource,
						this.graph.isCloneEvent(me.getEvent()) && this.cloneEnabled &&
						this.graph.isCellsCloneable(), me);
				}
				else if (this.graph.isAllowDanglingEdges())
				{
					var pt = this.abspoints[(this.isSource) ? 0 : this.abspoints.length - 1];
					pt.x = pt.x / this.graph.view.scale - this.graph.view.translate.x;
					pt.y = pt.y / this.graph.view.scale - this.graph.view.translate.y;

					var pstate = this.graph.getView().getState(
							this.graph.getModel().getParent(edge));
							
					if (pstate != null)
					{
						pt.x -= pstate.origin.x;
						pt.y -= pstate.origin.y;
					}
					
					pt.x -= this.graph.panDx / this.graph.view.scale;
					pt.y -= this.graph.panDy / this.graph.view.scale;
										
					// Destroys and rectreates this handler
					this.changeTerminalPoint(edge, pt, this.isSource);
				}
			}
			else if (this.active)
			{
				this.changePoints(edge, this.points);
			}
			else
			{
				this.graph.getView().invalidate(this.state.cell);
				this.graph.getView().revalidate(this.state.cell);						
			}
		}
		
		// Resets the preview color the state of the handler if this
		// handler has not been recreated
		if (this.marker != null)
		{
			this.reset();

			// Updates the selection if the edge has been cloned
			if (edge != this.state.cell)
			{
				this.graph.setSelectionCell(edge);
			}
		}

		me.consume();
	}
};

/**
 * Function: reset
 * 
 * Resets the state of this handler.
 */
mxEdgeHandler.prototype.reset = function()
{
	this.error = null;
	this.index = null;
	this.label = null;
	this.points = null;
	this.active = false;
	this.isLabel = false;
	this.isSource = false;
	this.isTarget = false;
	this.marker.reset();
	this.constraintHandler.reset();
	this.setPreviewColor(mxConstants.EDGE_SELECTION_COLOR);
	this.redraw();
};

/**
 * Function: setPreviewColor
 * 
 * Sets the color of the preview to the given value.
 */
mxEdgeHandler.prototype.setPreviewColor = function(color)
{
	if (this.shape != null)
	{
		this.shape.stroke = color;
	}
};


/**
 * Function: convertPoint
 * 
 * Converts the given point in-place from screen to unscaled, untranslated
 * graph coordinates and applies the grid. Returns the given, modified
 * point instance.
 * 
 * Parameters:
 * 
 * point - <mxPoint> to be converted.
 * gridEnabled - Boolean that specifies if the grid should be applied.
 */
mxEdgeHandler.prototype.convertPoint = function(point, gridEnabled)
{
	var scale = this.graph.getView().getScale();
	var tr = this.graph.getView().getTranslate();
		
	if (gridEnabled)
	{
		point.x = this.graph.snap(point.x);
		point.y = this.graph.snap(point.y);
	}
	
	point.x = Math.round(point.x / scale - tr.x);
	point.y = Math.round(point.y / scale - tr.y);

	var pstate = this.graph.getView().getState(
		this.graph.getModel().getParent(this.state.cell));

	if (pstate != null)
	{
		point.x -= pstate.origin.x;
		point.y -= pstate.origin.y;
	}

	return point;
};

/**
 * Function: moveLabel
 * 
 * Changes the coordinates for the label of the given edge.
 * 
 * Parameters:
 * 
 * edge - <mxCell> that represents the edge.
 * x - Integer that specifies the x-coordinate of the new location.
 * y - Integer that specifies the y-coordinate of the new location.
 */
mxEdgeHandler.prototype.moveLabel = function(edgeState, x, y)
{
	var model = this.graph.getModel();
	var geometry = model.getGeometry(edgeState.cell);
	
	if (geometry != null)
	{
		geometry = geometry.clone();
		
		// Resets the relative location stored inside the geometry
		var pt = this.graph.getView().getRelativePoint(edgeState, x, y);
		geometry.x = pt.x;
		geometry.y = pt.y;
		
		// Resets the offset inside the geometry to find the offset
		// from the resulting point
		var scale = this.graph.getView().scale;
		geometry.offset = new mxPoint(0, 0);
		var pt = this.graph.view.getPoint(edgeState, geometry);
		geometry.offset = new mxPoint((x - pt.x) / scale, (y - pt.y) / scale);

		model.setGeometry(edgeState.cell, geometry);
	}
};

/**
 * Function: connect
 * 
 * Changes the terminal or terminal point of the given edge in the graph
 * model.
 * 
 * Parameters:
 * 
 * edge - <mxCell> that represents the edge to be reconnected.
 * terminal - <mxCell> that represents the new terminal.
 * isSource - Boolean indicating if the new terminal is the source or
 * target terminal.
 * isClone - Boolean indicating if the new connection should be a clone of
 * the old edge.
 * me - <mxMouseEvent> that contains the mouse up event.
 */
mxEdgeHandler.prototype.connect = function(edge, terminal, isSource, isClone, me)
{
	var model = this.graph.getModel();
	var parent = model.getParent(edge);
	
	model.beginUpdate();
	try
	{
		// Clones and adds the cell
		if (isClone)
		{
			var clone = edge.clone();
			model.add(parent, clone, model.getChildCount(parent));
			
			var other = model.getTerminal(edge, !isSource);
			this.graph.connectCell(clone, other, !isSource);
			
			edge = clone;
		}

		var constraint = this.constraintHandler.currentConstraint;
		
		if (constraint == null)
		{
			constraint = new mxConnectionConstraint();
		}

		this.graph.connectCell(edge, terminal, isSource, constraint);
	}
	finally
	{
		model.endUpdate();
	}
	
	return edge;
};

/**
 * Function: changeTerminalPoint
 * 
 * Changes the terminal point of the given edge.
 */
mxEdgeHandler.prototype.changeTerminalPoint = function(edge, point, isSource)
{
	var model = this.graph.getModel();
	var geo = model.getGeometry(edge);
	
	if (geo != null)
	{
		model.beginUpdate();
		try
		{
			geo = geo.clone();
			geo.setTerminalPoint(point, isSource);
			model.setGeometry(edge, geo);
			this.graph.connectCell(edge, null, isSource, new mxConnectionConstraint());
		}
		finally
		{
			model.endUpdate();
		}
	}
};

/**
 * Function: changePoints
 * 
 * Changes the control points of the given edge in the graph model.
 */
mxEdgeHandler.prototype.changePoints = function(edge, points)
{
	var model = this.graph.getModel();
	var geo = model.getGeometry(edge);
	
	if (geo != null)
	{
		geo = geo.clone();
		geo.points = points;
		
		model.setGeometry(edge, geo);
	}
};

/**
 * Function: addPoint
 * 
 * Adds a control point for the given state and event.
 */
mxEdgeHandler.prototype.addPoint = function(state, evt)
{
	var pt = mxUtils.convertPoint(this.graph.container, mxEvent.getClientX(evt),
			mxEvent.getClientY(evt));
	var gridEnabled = this.graph.isGridEnabledEvent(evt);
	this.convertPoint(pt, gridEnabled);
	this.addPointAt(state, pt.x, pt.y);
	mxEvent.consume(evt);
};

/**
 * Function: addPointAt
 * 
 * Adds a control point at the given point.
 */
mxEdgeHandler.prototype.addPointAt = function(state, x, y)
{
	var geo = this.graph.getCellGeometry(state.cell);
	var pt = new mxPoint(x, y);
	
	if (geo != null)
	{
		geo = geo.clone();
		var t = this.graph.view.translate;
		var s = this.graph.view.scale;
		var index = mxUtils.findNearestSegment(state, (pt.x + t.x) * s, (pt.y + t.y) * s);

		if (geo.points == null)
		{
			geo.points = [pt];
		}
		else
		{
			geo.points.splice(index, 0, pt);
		}
		
		this.graph.getModel().setGeometry(state.cell, geo);
		this.destroy();
		this.init();
	}
};

/**
 * Function: removePoint
 * 
 * Removes the control point at the given index from the given state.
 */
mxEdgeHandler.prototype.removePoint = function(state, index)
{
	if (index > 0 && index < this.abspoints.length - 1)
	{
		var geo = this.graph.getCellGeometry(this.state.cell);
		
		if (geo != null && geo.points != null)
		{
			geo = geo.clone();
			geo.points.splice(index - 1, 1);
			this.graph.getModel().setGeometry(state.cell, geo);
			this.destroy();
			this.init();
		}
	}
};

/**
 * Function: getHandleFillColor
 * 
 * Returns the fillcolor for the handle at the given index.
 */
mxEdgeHandler.prototype.getHandleFillColor = function(index)
{
	var isSource = index == 0;
	var cell = this.state.cell;
	var terminal = this.graph.getModel().getTerminal(cell, isSource);
	var color = mxConstants.HANDLE_FILLCOLOR;
	
	if ((terminal != null && !this.graph.isCellDisconnectable(cell, terminal, isSource)) ||
		(terminal == null && !this.graph.isTerminalPointMovable(cell, isSource)))
	{
		color = mxConstants.LOCKED_HANDLE_FILLCOLOR;
	}
	else if (terminal != null && this.graph.isCellDisconnectable(cell, terminal, isSource))
	{
		color = mxConstants.CONNECT_HANDLE_FILLCOLOR;
	}
	
	return color;
};

/**
 * Function: redraw
 * 
 * Redraws the preview, and the bends- and label control points.
 */
mxEdgeHandler.prototype.redraw = function()
{
	this.abspoints = this.state.absolutePoints.slice();
	this.redrawHandles();
	
	var g = this.graph.getModel().getGeometry(this.state.cell);
	var pts = g.points;

	if (this.bends != null && this.bends.length > 0)
	{
		if (pts != null)
		{
			if (this.points == null)
			{
				this.points = [];
			}
			
			for (var i = 1; i < this.bends.length - 1; i++)
			{
				if (this.bends[i] != null && this.abspoints[i] != null)
				{
					this.points[i - 1] = pts[i - 1];
				}
			}
		}
	}
	
	this.drawPreview();
};

/**
 * Function: redrawHandles
 * 
 * Redraws the handles.
 */
mxEdgeHandler.prototype.redrawHandles = function()
{
	var cell = this.state.cell;

	// Updates the handle for the label position
	var s = mxConstants.LABEL_HANDLE_SIZE;
	
	this.label = new mxPoint(this.state.absoluteOffset.x, this.state.absoluteOffset.y);
	this.labelShape.bounds = new mxRectangle(Math.round(this.label.x - s / 2),
		Math.round(this.label.y - s / 2), s, s);
	this.labelShape.redraw();
	
	// Shows or hides the label handle depending on the label
	var lab = this.graph.getLabel(cell);
	
	if (lab != null && lab.length > 0 && this.graph.isLabelMovable(cell))
	{
		this.labelShape.node.style.visibility = 'visible';
	}
	else
	{
		this.labelShape.node.style.visibility = 'hidden';
	}
	
	if (this.bends != null && this.bends.length > 0)
	{
		var n = this.abspoints.length - 1;
		
		var p0 = this.abspoints[0];
		var x0 = this.abspoints[0].x;
		var y0 = this.abspoints[0].y;
		
		var b = this.bends[0].bounds;
		this.bends[0].bounds = new mxRectangle(Math.round(x0 - b.width / 2),
				Math.round(y0 - b.height / 2), b.width, b.height);
		this.bends[0].fill = this.getHandleFillColor(0);
		this.bends[0].redraw();
		
		var pe = this.abspoints[n];
		var xn = this.abspoints[n].x;
		var yn = this.abspoints[n].y;
		
		var bn = this.bends.length - 1;
		b = this.bends[bn].bounds;
		this.bends[bn].bounds = new mxRectangle(Math.round(xn - b.width / 2),
				Math.round(yn - b.height / 2), b.width, b.height);
		this.bends[bn].fill = this.getHandleFillColor(bn);
		this.bends[bn].redraw();

		this.redrawInnerBends(p0, pe);
	}
};

/**
 * Function: redrawInnerBends
 * 
 * Updates and redraws the inner bends.
 * 
 * Parameters:
 * 
 * p0 - <mxPoint> that represents the location of the first point.
 * pe - <mxPoint> that represents the location of the last point.
 */
mxEdgeHandler.prototype.redrawInnerBends = function(p0, pe)
{
	for (var i = 1; i < this.bends.length-1; i++)
	{
		if (this.bends[i] != null)
		{
			if (this.abspoints[i] != null)
			{
				var x = this.abspoints[i].x;
				var y = this.abspoints[i].y;
				
				var b = this.bends[i].bounds;
				this.bends[i].node.style.visibility = 'visible';
				this.bends[i].bounds = new mxRectangle(Math.round(x - b.width / 2),
						Math.round(y - b.height / 2), b.width, b.height);
				this.bends[i].redraw();
			}
			else
			{
				this.bends[i].destroy();
				this.bends[i] = null;
			}
		}
	}
};

/**
 * Function: drawPreview
 * 
 * Redraws the preview.
 */
mxEdgeHandler.prototype.drawPreview = function()
{
	if (this.isLabel)
	{
		var s = mxConstants.LABEL_HANDLE_SIZE;
	
		var bounds = new mxRectangle(Math.round(this.label.x - s / 2),
				Math.round(this.label.y - s / 2), s, s);
		this.labelShape.bounds = bounds;
		this.labelShape.redraw();
	}
	else
	{
		this.shape.points = this.abspoints;
		this.shape.redraw();
	}
};

/**
 * Function: destroy
 * 
 * Destroys the handler and all its resources and DOM nodes. This does
 * normally not need to be called as handlers are destroyed automatically
 * when the corresponding cell is deselected.
 */
mxEdgeHandler.prototype.destroy = function()
{
	if (this.marker != null)
	{
		this.marker.destroy();
		this.marker = null;
	}
	
	if (this.shape != null)
	{
		this.shape.destroy();
		this.shape = null;
	}
	
	if (this.labelShape != null)
	{
		this.labelShape.destroy();
		this.labelShape = null;
	}

	if (this.constraintHandler != null)
	{
		this.constraintHandler.destroy();
		this.constraintHandler = null;
	}

	// Destroy the control points for the bends
	if (this.bends != null)
	{
		for (var i = 0; i < this.bends.length; i++)
		{
			if (this.bends[i] != null)
			{
				this.bends[i].destroy();
				this.bends[i] = null;
			}
		}
		
		this.bends = null;
	}
};