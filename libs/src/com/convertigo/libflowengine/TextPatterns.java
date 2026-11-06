/*
 * Copyright (c) 2001-2026 Convertigo SA.
 *
 * This program  is free software; you  can redistribute it and/or
 * Modify  it  under the  terms of the  GNU  Affero General Public
 * License  as published by  the Free Software Foundation;  either
 * version  3  of  the  License,  or  (at your option)  any  later
 * version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY;  without even the implied warranty of
 * MERCHANTABILITY  or  FITNESS  FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this program;
 * if not, see <http://www.gnu.org/licenses/>.
 */

package com.convertigo.libflowengine;

import java.util.regex.Matcher;

/**
 * The execution budget of the regular expressions of lib/text-pattern.js. java.util.regex reads its input only through
 * CharSequence.charAt: a text that counts these reads and stops past a number of them, or past a deadline, stops a
 * backtracking pattern from inside the matcher, which a thread interruption or a delay measured after the call cannot.
 * The JavaScript fallback of lib/text-pattern.js (when these classes are not compiled) does the same, slower.
 */
public final class TextPatterns {
	private TextPatterns() {
	}

	/** Thrown from charAt when the budget is spent; without a stack trace, it may be thrown deep in a recursion. */
	public static final class BudgetExceeded extends RuntimeException {
		private static final long serialVersionUID = 1L;

		BudgetExceeded() {
			super("text pattern budget exceeded", null, false, false);
		}
	}

	/**
	 * A budget of reads and time, for one operation (a match, a replacement, a split) or shared by several (a search
	 * through files, which may also charge the volume it reads).
	 */
	public static final class Budget {
		private final long maxSteps;
		private final long deadline;
		private long steps;
		private boolean exceeded;

		Budget(long maxSteps, long timeoutMillis) {
			this.maxSteps = maxSteps;
			this.deadline = System.nanoTime() + Math.max(1L, timeoutMillis) * 1000000L;
		}

		/** Counts count steps; throws BudgetExceeded past the number of steps or the deadline. */
		public void charge(long count) {
			long before = steps;
			steps += Math.max(0L, count);
			if (steps > maxSteps || (before >>> 12) != (steps >>> 12) && System.nanoTime() - deadline > 0L) {
				exceeded = true;
				throw new BudgetExceeded();
			}
		}

		public boolean exceeded() {
			return exceeded;
		}

		public long steps() {
			return steps;
		}
	}

	/** A text whose reads by a matcher are counted in a budget. */
	public static final class BudgetedText implements CharSequence {
		private final String text;
		private final Budget budget;

		BudgetedText(String text, Budget budget) {
			this.text = text;
			this.budget = budget;
		}

		@Override
		public char charAt(int index) {
			Budget b = budget;
			if (++b.steps > b.maxSteps || (b.steps & 4095L) == 0L && System.nanoTime() - b.deadline > 0L) {
				b.exceeded = true;
				throw new BudgetExceeded();
			}
			return text.charAt(index);
		}

		@Override
		public int length() {
			return text.length();
		}

		/** The groups of a match, read once the matcher has found it: not counted. */
		@Override
		public CharSequence subSequence(int start, int end) {
			return text.substring(start, end);
		}

		@Override
		public String toString() {
			return text;
		}

		public Budget budget() {
			return budget;
		}
	}

	/** @return a budget of at most maxSteps reads, for at most timeoutMillis from now */
	public static Budget budget(long maxSteps, long timeoutMillis) {
		return new Budget(maxSteps, timeoutMillis);
	}

	/** @return text, its reads by a matcher counted in budget */
	public static BudgetedText budgeted(String text, Budget budget) {
		return new BudgetedText(text == null ? "" : text, budget);
	}

	/**
	 * Matcher.find under the budget of its text: the recursion of java.util.regex on a long input (a group repeated
	 * thousands of times) ends in a StackOverflowError, which a script cannot catch, so it is reported here too.
	 *
	 * @param from the index where the search starts (Matcher.find(int), which resets the matcher), or -1 to go on
	 *             after the previous match (Matcher.find())
	 * @return 1 when a match is found, 0 when there is none, -1 when the budget is spent or the recursion too deep
	 */
	public static int find(Matcher matcher, int from) {
		try {
			return (from < 0 ? matcher.find() : matcher.find(from)) ? 1 : 0;
		} catch (BudgetExceeded e) {
			return -1;
		} catch (StackOverflowError e) {
			return -1;
		}
	}
}
