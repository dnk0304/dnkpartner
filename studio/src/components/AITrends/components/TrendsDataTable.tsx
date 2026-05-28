import React, { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, ExternalLink, Star, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';

export interface TrendData {
  id: string;
  rank: number;
  asin: string;
  imageUrl: string;
  title: string;
  price: number;
  rating: number;
  reviews: number;
  sales: number;
  revenue: number;
  isSimulated?: boolean;
}

interface TrendsDataTableProps {
  data: TrendData[];
  onRowClick?: (row: TrendData) => void;
  className?: string;
  pageSize?: number;
  enablePagination?: boolean;
  isSimulated?: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

export function TrendsDataTable({ 
  data, 
  onRowClick, 
  className,
  pageSize = DEFAULT_PAGE_SIZE,
  enablePagination = true,
  isSimulated = false
}: TrendsDataTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  
  // Calculate pagination values
  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  // Get paginated data
  const paginatedData = useMemo(() => {
    if (!enablePagination) return data;
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, pageSize, enablePagination]);
  
  // Reset to page 1 when data changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [data.length]);
  
  // Pagination handlers
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };
  
  const goToFirstPage = () => goToPage(1);
  const goToLastPage = () => goToPage(totalPages);
  const goToPrevPage = () => goToPage(currentPage - 1);
  const goToNextPage = () => goToPage(currentPage + 1);
  
  // Calculate display range
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  
  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };
  
  return (
    <div className={cn("bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col", className)}>
      {/* Scrollable Table Container */}
      <div className="overflow-auto flex-1 max-h-[600px]">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500 w-16 text-center">Rank</th>
              <th className="px-4 py-3 font-medium text-gray-500 w-20">Image</th>
              <th className="px-4 py-3 font-medium text-gray-500">Product Title / ASIN</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-indigo-600">
                Price
              </th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Rating</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-indigo-600">
                Mo. Sales
              </th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-indigo-600">
                Revenue
              </th>
              <th className="px-4 py-3 font-medium text-gray-500 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  <p className="font-medium">No data available</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr 
                  key={row.id} 
                  onClick={() => onRowClick?.(row)}
                  className="hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3 text-center font-mono text-gray-600">#{row.rank}</td>
                  <td className="px-4 py-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-md overflow-hidden border border-gray-200">
                      <img src={row.imageUrl} alt={row.asin} className="w-full h-full object-cover" />
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="font-medium text-gray-900 truncate" title={row.title}>{row.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{row.asin}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ${row.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 text-amber-500">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span className="text-gray-900 font-medium">{row.rating}</span>
                      <span className="text-gray-400 text-xs">({row.reviews})</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {row.sales.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ${row.revenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isSimulated || row.isSimulated ? (
                      <div 
                        className="inline-flex items-center text-gray-300 cursor-not-allowed"
                        title="Product link unavailable for simulated data"
                      >
                        <ExternalLink className="w-4 h-4 opacity-30" />
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={`https://www.amazon.com/dp/${row.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-center"
                        >
                          <ExternalLink className="w-4 h-4 text-gray-400 hover:text-indigo-600" />
                        </a>
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      {enablePagination && totalItems > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          {/* Results info */}
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-700">{startItem}</span> to{' '}
            <span className="font-medium text-gray-700">{endItem}</span> of{' '}
            <span className="font-medium text-gray-700">{totalItems}</span> results
          </div>
          
          {/* Pagination buttons */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              {/* First page */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goToFirstPage}
                disabled={currentPage === 1}
                className="text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                title="First page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              
              {/* Previous page */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                className="text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              {/* Page numbers */}
              <div className="flex items-center gap-1 mx-2">
                {getPageNumbers().map((page, index) => (
                  page === '...' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => goToPage(page as number)}
                      className={cn(
                        "min-w-[32px] h-8 px-2 text-sm font-medium rounded-md transition-colors",
                        currentPage === page
                          ? "bg-indigo-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      {page}
                    </button>
                  )
                ))}
              </div>
              
              {/* Next page */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              
              {/* Last page */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goToLastPage}
                disabled={currentPage === totalPages}
                className="text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Last page"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

